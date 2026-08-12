import { projectRequiresStaffing } from '../core.mjs';
import { buildPersonCapacitySeries, dateKeys, internalAssignmentPlanningWindow } from './capacity-calendar.mjs';
import { localDateKey } from '../utils/date.mjs';

function clampKey(value,min,max){
  if(!value)return '';
  if(min&&value<min)return min;
  if(max&&value>max)return max;
  return value;
}

function barGeometry(startDate,endDate,columns){
  if(!columns.length)return null;
  const first=columns[0],last=columns.at(-1);
  const start=clampKey(startDate||first,first,last);
  const end=clampKey(endDate||last,first,last);
  if(end<first||start>last||end<start)return null;
  const startIndex=columns.indexOf(start);
  const endIndex=columns.indexOf(end);
  if(startIndex<0||endIndex<0)return null;
  return {startDate:start,endDate:end,startIndex,endIndex,span:endIndex-startIndex+1};
}

export function buildResourceGanttModel(db,{startDate=localDateKey(new Date()),days=30,includeInactive=false}={}){
  const columns=dateKeys(startDate,days);
  const endDate=columns.at(-1)||startDate;
  const people=(db.people||[]).filter(person=>includeInactive||person.employmentStatus==='在岗');
  const rows=people.map(person=>{
    const bars=[];
    for(const assignment of (db.assignments||[]).filter(item=>item.personId===person.id)){
      const window=internalAssignmentPlanningWindow(db,assignment);
      if(!window.active)continue;
      const geometry=barGeometry(window.startDate||startDate,window.endDate||endDate,columns);
      if(!geometry)continue;
      bars.push({
        id:assignment.id,type:'internal',projectId:assignment.projectId,
        name:window.project?.name||'项目已删除',role:assignment.role||'',allocation:Number(assignment.allocation||0),
        status:assignment.status||'',...geometry
      });
    }
    for(const assignment of person.externalAssignments||[]){
      if(['已结束','已取消'].includes(assignment.status))continue;
      const geometry=barGeometry(assignment.startDate||startDate,assignment.endDate||endDate,columns);
      if(!geometry)continue;
      bars.push({
        id:assignment.id,type:'external',projectId:'',name:assignment.name||'外部项目',role:assignment.role||'',allocation:Number(assignment.allocation||0),
        status:assignment.status||'',...geometry
      });
    }
    bars.sort((a,b)=>a.startIndex-b.startIndex||b.span-a.span||String(a.name).localeCompare(String(b.name),'zh-CN'));
    return {
      id:person.id,label:person.name,person,
      capacity:buildPersonCapacitySeries(db,person,{startDate,days}),
      bars
    };
  });
  return {kind:'resource',startDate,endDate,columns,rows};
}

export function buildProjectGanttModel(db,{startDate=localDateKey(new Date()),days=60,includeCompleted=false}={}){
  const columns=dateKeys(startDate,days);
  const endDate=columns.at(-1)||startDate;
  const projects=(db.projects||[]).filter(project=>includeCompleted||projectRequiresStaffing(project));
  const rows=projects.map(project=>{
    const projectGeometry=barGeometry(project.startDate||startDate,project.ddl||endDate,columns);
    const assignments=(db.assignments||[]).filter(item=>item.projectId===project.id).map(assignment=>{
      const window=internalAssignmentPlanningWindow(db,assignment);
      if(!window.active)return null;
      const geometry=barGeometry(window.startDate||project.startDate||startDate,window.endDate||project.ddl||endDate,columns);
      return geometry?{id:assignment.id,personId:assignment.personId,role:assignment.role||'',allocation:Number(assignment.allocation||0),...geometry}:null;
    }).filter(Boolean);
    const milestones=[
      ['asset',project.assetCompletionDate,'资产完成'],
      ['video',project.videoCompletionDate,'视频完成'],
      ['ddl',project.ddl,'DDL']
    ].filter(([,date])=>date&&date>=startDate&&date<=endDate).map(([type,date,label])=>({type,date,label,index:columns.indexOf(date)}));
    return {id:project.id,label:project.name,project,bar:projectGeometry,assignments,milestones};
  }).filter(row=>row.bar||row.assignments.length||row.milestones.length);
  rows.sort((a,b)=>String(a.project.ddl||'9999-12-31').localeCompare(String(b.project.ddl||'9999-12-31'))||String(a.label).localeCompare(String(b.label),'zh-CN'));
  return {kind:'project',startDate,endDate,columns,rows};
}

function localizeBar(bar,start,end){
  if(!bar||bar.endIndex<start||bar.startIndex>=end)return null;
  const localStart=Math.max(0,bar.startIndex-start);
  const localEnd=Math.min(end-start-1,bar.endIndex-start);
  return {...bar,startIndex:localStart,endIndex:localEnd,viewportStart:localStart,viewportEnd:localEnd,span:localEnd-localStart+1};
}

export function ganttViewport(model,{offset=0,length=14}={}){
  const maxStart=Math.max(0,model.columns.length-1);
  const start=Math.min(maxStart,Math.max(0,Number(offset||0)));
  const end=Math.min(model.columns.length,start+Math.max(1,Number(length||14)));
  const columns=model.columns.slice(start,end);
  const visibleDates=new Set(columns);
  const rows=model.rows.map(row=>({
    ...row,
    bar:localizeBar(row.bar,start,end),
    bars:row.bars?.map(bar=>localizeBar(bar,start,end)).filter(Boolean),
    assignments:row.assignments?.map(bar=>localizeBar(bar,start,end)).filter(Boolean),
    milestones:row.milestones?.filter(item=>item.index>=start&&item.index<end).map(item=>({...item,viewportIndex:item.index-start})),
    capacity:row.capacity?.filter(day=>visibleDates.has(day.date))
  }));
  return {...model,columns,rows,viewport:{offset:start,length:end-start}};
}
