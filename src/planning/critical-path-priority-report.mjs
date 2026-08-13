import { buildCriticalPathNeedPriorityModel } from './critical-path-priority.mjs';
import { localDateKey } from '../utils/date.mjs';

function projectPriorityComponent(priority=''){
  const match=String(priority||'').toUpperCase().match(/P([0-3])/);
  const value=({0:400,1:250,2:100,3:0})[match?.[1]]??0;
  return {key:'businessPriority',label:priority||'项目优先级未设置',value};
}

export function criticalPathPriorityComponents(item){
  const node=item?.state?.node||{};
  const gap=Math.min(100,Math.max(0,Number(item?.gap||0)));
  return [
    {key:'criticalPath',label:node.critical?'关键路径':'非关键路径',value:node.critical?1000:0},
    {key:'deadlineRisk',label:Number(node.lateByWorkingDays||0)>0?`预计晚 ${node.lateByWorkingDays} 个工作日`:'无关键路径逾期',value:Math.max(0,Number(node.lateByWorkingDays||0))*250},
    projectPriorityComponent(item?.project?.priority),
    {key:'float',label:Number(node.totalFloatDays||0)>0?`浮动 ${node.totalFloatDays} 个工作日`:'无可用浮动',value:-Math.max(0,Number(node.totalFloatDays||0))*20},
    {key:'gap',label:`人员缺口 ${gap}%`,value:gap*.25}
  ].map(component=>({...component,value:Math.round(component.value*10)/10}));
}

export function criticalPathPriorityQueueReport(db,{startDate=localDateKey(new Date())}={}){
  const model=buildCriticalPathNeedPriorityModel(db,{startDate});
  if(!model.ok)return {ok:false,error:model.error,model,items:[]};
  const items=model.priorities.map((item,index)=>{
    const components=criticalPathPriorityComponents(item);
    const componentTotal=Math.round(components.reduce((sum,component)=>sum+component.value,0)*10)/10;
    return {
      rank:index+1,needId:item.need.id,projectId:item.project.id,projectName:item.project.name,role:item.need.role,
      gap:item.gap,earliestStaffingDate:item.earliestStaffingDate,critical:item.critical,
      priorityScore:item.priorityScore,componentTotal,components,
      reasons:[...item.priorityReasons],
      lateByWorkingDays:Number(item.state?.node?.lateByWorkingDays||0),
      totalFloatDays:Number(item.state?.node?.totalFloatDays||0)
    };
  });
  return {ok:true,model,items};
}
