import { needAllocated, projectRequiresStaffing } from '../core.mjs';

function fail(error){return {ok:false,error};}
function success(scenario){return {ok:true,scenario};}

export function createFillNeedScenario(db,{needId,personId,allocation,id,label}={}){
  const need=(db.staffingNeeds||[]).find(item=>item.id===needId);
  if(!need)return fail('用人需求不存在');
  const project=(db.projects||[]).find(item=>item.id===need.projectId);
  if(!project||!projectRequiresStaffing(project))return fail('项目当前无需人员安排');
  const person=(db.people||[]).find(item=>item.id===personId);
  if(!person)return fail('候选人员不存在');
  if(person.employmentStatus!=='在岗')return fail('候选人员当前不在岗');
  const gap=Math.max(0,Number(need.requiredCapacity||0)-needAllocated(db,need));
  if(gap<=0)return fail('该需求已经满足');
  const capacity=Math.min(gap,Math.max(1,Number(allocation||gap)));
  return success({
    id:id||`fill:${need.id}:${person.id}`,
    label:label||`用 ${person.name} 补齐 ${project.name} · ${need.role}`,
    description:`模拟新增 ${capacity}% 产能，不修改真实排班。`,
    commands:[{type:'assignment.assign',payload:{
      needId:need.id,projectId:project.id,personId:person.id,role:need.role,stage:need.stage||'其它',
      allocation:capacity,status:'进行中',startDate:need.neededBy||project.startDate||'',endDate:project.ddl||''
    }}]
  });
}

export function createTransferAssignmentScenario(db,{assignmentId,targetPersonId,id,label}={}){
  const assignment=(db.assignments||[]).find(item=>item.id===assignmentId);
  if(!assignment)return fail('原分工不存在');
  if(['已结束','已取消'].includes(assignment.status))return fail('已结束或取消的分工不能转移');
  const source=(db.people||[]).find(item=>item.id===assignment.personId);
  const target=(db.people||[]).find(item=>item.id===targetPersonId);
  if(!target)return fail('目标人员不存在');
  if(target.employmentStatus!=='在岗')return fail('目标人员当前不在岗');
  if(target.id===assignment.personId)return fail('目标人员与原人员相同');
  const project=(db.projects||[]).find(item=>item.id===assignment.projectId);
  return success({
    id:id||`transfer:${assignment.id}:${target.id}`,
    label:label||`将 ${project?.name||'项目'} · ${assignment.role||'分工'} 从 ${source?.name||'原人员'} 转给 ${target.name}`,
    description:`保持 ${Number(assignment.allocation||0)}% 投入和原日期窗口。`,
    commands:[
      {type:'assignment.remove',payload:{id:assignment.id}},
      {type:'assignment.assign',payload:{
        needId:assignment.needId||'',projectId:assignment.projectId,personId:target.id,role:assignment.role||'',stage:assignment.stage||'其它',
        allocation:Number(assignment.allocation||0),status:assignment.status||'进行中',startDate:assignment.startDate||'',endDate:assignment.endDate||''
      }}
    ]
  });
}

export function createPersonCapacityScenario(db,{personId,capacity,employmentStatus,id,label}={}){
  const person=(db.people||[]).find(item=>item.id===personId);
  if(!person)return fail('人员不存在');
  const nextCapacity=capacity===''||capacity===undefined?Number(person.capacity||100):Number(capacity);
  if(!Number.isFinite(nextCapacity)||nextCapacity<0||nextCapacity>300)return fail('标准产能需在 0-300 之间');
  const nextStatus=employmentStatus||person.employmentStatus||'在岗';
  return success({
    id:id||`person:${person.id}:${nextStatus}:${nextCapacity}`,
    label:label||`模拟 ${person.name}：${nextStatus} / ${nextCapacity}% 标准产能`,
    description:'模拟人员状态或标准产能变化，原数据保持不变。',
    commands:[{type:'person.upsert',payload:{id:person.id,values:{...person,capacity:nextCapacity,employmentStatus:nextStatus}}}]
  });
}

export function createProjectDatesScenario(db,{projectId,startDate,ddl,status,id,label}={}){
  const project=(db.projects||[]).find(item=>item.id===projectId);
  if(!project)return fail('项目不存在');
  const nextStart=startDate===undefined?project.startDate||'':startDate;
  const nextDdl=ddl===undefined?project.ddl||'':ddl;
  if(nextStart&&nextDdl&&nextStart>nextDdl)return fail('项目启动日期不能晚于 DDL');
  const nextStatus=status||project.status;
  return success({
    id:id||`project:${project.id}:${nextStart}:${nextDdl}:${nextStatus}`,
    label:label||`调整 ${project.name} 日期 / 状态`,
    description:`启动 ${nextStart||'未设置'} · DDL ${nextDdl||'未设置'} · ${nextStatus||'未设置状态'}`,
    commands:[{type:'project.upsert',payload:{id:project.id,values:{...project,startDate:nextStart,ddl:nextDdl,status:nextStatus}}}]
  });
}
