import {
  isPersonSchedulable,
  migratePerson,
  needAllocated,
  projectRequiresStaffing,
  uid
} from '../core.mjs';
import { cloneDatabase } from '../schema/database.mjs';
import { localDateKey } from '../utils/date.mjs';

export class ResourceCommandError extends Error {
  constructor(message,code='COMMAND_INVALID'){
    super(message);
    this.name='ResourceCommandError';
    this.code=code;
  }
}

function assert(condition,message,code){
  if(!condition)throw new ResourceCommandError(message,code);
}

function addActivity(db,type,text,now){
  db.activity=db.activity||[];
  db.activity.unshift({id:uid('log'),type,text,at:now.toISOString()});
  db.activity=db.activity.slice(0,80);
}

export function reconcileStaffingNeeds(db){
  for(const need of db.staffingNeeds||[]){
    const project=(db.projects||[]).find(item=>item.id===need.projectId);
    if(!projectRequiresStaffing(project)){
      need.status='已满足';
      continue;
    }
    need.status=needAllocated(db,need)>=Number(need.requiredCapacity||0)?'已满足':'待安排';
  }
  return db;
}

function upsertProject(db,payload,now){
  const values=payload.values||payload;
  const id=payload.id||values.id||'';
  const name=String(values.name||'').trim();
  assert(name,'项目名称不能为空','PROJECT_NAME_REQUIRED');
  const duplicate=db.projects.find(item=>item.name===name&&item.id!==id);
  assert(!duplicate,'项目名称已存在','PROJECT_DUPLICATE_NAME');
  let project=id?db.projects.find(item=>item.id===id):null;
  if(id)assert(project,'项目不存在','PROJECT_NOT_FOUND');
  if(project)Object.assign(project,values,{id:project.id,name});
  else{
    project={id:uid('project'),...values,name};
    db.projects.unshift(project);
  }
  addActivity(db,id?'更新项目':'新建项目',name,now);
  return {entity:project,effects:[]};
}

function deleteProject(db,payload,now){
  const id=payload.id;
  const project=db.projects.find(item=>item.id===id);
  assert(project,'项目不存在','PROJECT_NOT_FOUND');
  db.projects=db.projects.filter(item=>item.id!==id);
  db.assignments=db.assignments.filter(item=>item.projectId!==id);
  db.staffingNeeds=db.staffingNeeds.filter(item=>item.projectId!==id);
  addActivity(db,'删除项目',project.name,now);
  return {entity:project,effects:[]};
}

function upsertPerson(db,payload,now){
  const values=payload.values||payload;
  const id=payload.id||values.id||'';
  const name=String(values.name||'').trim();
  assert(name,'人员姓名不能为空','PERSON_NAME_REQUIRED');
  const duplicate=db.people.find(item=>item.name===name&&item.id!==id);
  assert(!duplicate,'人员姓名已存在','PERSON_DUPLICATE_NAME');
  let person=id?db.people.find(item=>item.id===id):null;
  if(id)assert(person,'人员不存在','PERSON_NOT_FOUND');
  const normalized=migratePerson({...person,...values,id:person?.id||uid('person'),name});
  if(person)Object.assign(person,normalized);
  else{person=normalized;db.people.unshift(person);}
  addActivity(db,id?'更新人员':'新增人员',name,now);
  return {entity:person,effects:[{type:'syncPeopleAccounts'}]};
}

function deletePerson(db,payload,now){
  const person=db.people.find(item=>item.id===payload.id);
  assert(person,'人员不存在','PERSON_NOT_FOUND');
  db.people=db.people.filter(item=>item.id!==person.id);
  db.assignments=db.assignments.filter(item=>item.personId!==person.id);
  reconcileStaffingNeeds(db);
  addActivity(db,'删除人员',person.name,now);
  return {entity:person,effects:[{type:'syncPeopleAccounts'}]};
}

function upsertNeed(db,payload,now){
  const values=payload.values||payload;
  const id=payload.id||values.id||'';
  const project=db.projects.find(item=>item.id===values.projectId);
  assert(project,'项目不存在','PROJECT_NOT_FOUND');
  assert(projectRequiresStaffing(project),'该项目当前无需人员安排','PROJECT_NOT_STAFFABLE');
  assert(String(values.role||'').trim(),'用人角色不能为空','NEED_ROLE_REQUIRED');
  const requiredCapacity=Number(values.requiredCapacity||0);
  assert(requiredCapacity>0,'所需产能必须大于 0','NEED_CAPACITY_INVALID');
  let need=id?db.staffingNeeds.find(item=>item.id===id):null;
  if(id)assert(need,'用人需求不存在','NEED_NOT_FOUND');
  const next={...values,requiredCapacity,status:'待安排'};
  if(need)Object.assign(need,next,{id:need.id});
  else{need={id:uid('need'),...next};db.staffingNeeds.unshift(need);}
  reconcileStaffingNeeds(db);
  addActivity(db,id?'更新用人需求':'新增用人需求',`${project.name} · ${need.role}`,now);
  return {entity:need,effects:[]};
}

function deleteNeed(db,payload,now){
  const need=db.staffingNeeds.find(item=>item.id===payload.id);
  assert(need,'用人需求不存在','NEED_NOT_FOUND');
  db.staffingNeeds=db.staffingNeeds.filter(item=>item.id!==need.id);
  db.assignments=db.assignments.map(item=>item.needId===need.id?{...item,needId:''}:item);
  addActivity(db,'删除用人需求',need.role,now);
  return {entity:need,effects:[]};
}

function assignPeople(db,payload,now){
  const project=db.projects.find(item=>item.id===payload.projectId);
  assert(project,'项目不存在','PROJECT_NOT_FOUND');
  assert(projectRequiresStaffing(project),'该项目当前无需人员安排','PROJECT_NOT_STAFFABLE');
  const personIds=[...new Set((payload.personIds||[payload.personId]).filter(Boolean))];
  assert(personIds.length,'请至少选择一位人员','ASSIGNMENT_PERSON_REQUIRED');
  const allocation=Number(payload.allocation||0);
  assert(allocation>0&&allocation<=100,'投入产能必须在 1% 到 100% 之间','ASSIGNMENT_ALLOCATION_INVALID');
  const role=String(payload.role||'').trim();
  assert(role,'项目角色不能为空','ASSIGNMENT_ROLE_REQUIRED');
  const created=[];
  for(const personId of personIds){
    const person=db.people.find(item=>item.id===personId);
    assert(person,`人员不存在：${personId}`,'PERSON_NOT_FOUND');
    assert(isPersonSchedulable(person),`${person.name} 当前不是在岗可调度状态`,'PERSON_NOT_SCHEDULABLE');
    const values={
      needId:payload.needId||'',projectId:project.id,personId:person.id,role,
      stage:payload.stage||'其它',allocation,status:payload.status||'进行中',
      startDate:payload.startDate||localDateKey(now),endDate:payload.endDate||''
    };
    let assignment=db.assignments.find(item=>item.projectId===project.id&&item.personId===person.id&&item.role===role&&!['已结束','已取消'].includes(item.status));
    if(assignment)Object.assign(assignment,values);
    else{assignment={id:uid('asg'),...values};db.assignments.unshift(assignment);}
    created.push(assignment);
  }
  reconcileStaffingNeeds(db);
  addActivity(db,'人员调度',`${created.length} 人 → ${project.name} · ${role}`,now);
  return {entity:created,effects:[]};
}

function removeAssignment(db,payload,now){
  const assignment=db.assignments.find(item=>item.id===payload.id);
  assert(assignment,'项目分工不存在','ASSIGNMENT_NOT_FOUND');
  db.assignments=db.assignments.filter(item=>item.id!==assignment.id);
  reconcileStaffingNeeds(db);
  addActivity(db,'移除项目人员',assignment.role||assignment.id,now);
  return {entity:assignment,effects:[]};
}

function setAssignmentStatus(db,payload,now){
  const assignment=db.assignments.find(item=>item.id===payload.id);
  assert(assignment,'项目分工不存在','ASSIGNMENT_NOT_FOUND');
  assignment.status=payload.status||assignment.status;
  if(payload.endDate!==undefined)assignment.endDate=payload.endDate;
  reconcileStaffingNeeds(db);
  addActivity(db,'更新项目分工',`${assignment.role||'项目分工'} → ${assignment.status}`,now);
  return {entity:assignment,effects:[]};
}

export function executeResourceCommand(database,command,{now=new Date()}={}){
  const db=cloneDatabase(database);
  try{
    let outcome;
    switch(command?.type){
      case 'project.upsert': outcome=upsertProject(db,command.payload||{},now);break;
      case 'project.delete': outcome=deleteProject(db,command.payload||{},now);break;
      case 'person.upsert': outcome=upsertPerson(db,command.payload||{},now);break;
      case 'person.delete': outcome=deletePerson(db,command.payload||{},now);break;
      case 'need.upsert': outcome=upsertNeed(db,command.payload||{},now);break;
      case 'need.delete': outcome=deleteNeed(db,command.payload||{},now);break;
      case 'assignment.assign': outcome=assignPeople(db,command.payload||{},now);break;
      case 'assignment.remove': outcome=removeAssignment(db,command.payload||{},now);break;
      case 'assignment.status': outcome=setAssignmentStatus(db,command.payload||{},now);break;
      default: throw new ResourceCommandError(`未知命令：${command?.type||''}`,'COMMAND_UNKNOWN');
    }
    return {ok:true,database:db,entity:outcome.entity,effects:outcome.effects||[]};
  }catch(error){
    if(error instanceof ResourceCommandError)return {ok:false,error:error.message,code:error.code,database};
    throw error;
  }
}
