import { assignmentRoleKey, projectRequiresStaffing } from '../core.mjs';
import { localDateKey } from '../utils/date.mjs';
import { workCalendarFromDatabase, workDateStatus } from './work-calendar.mjs';

function parseDateKey(value){
  const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match)return null;
  const date=new Date(Number(match[1]),Number(match[2])-1,Number(match[3]));
  return Number.isNaN(date.getTime())?null:date;
}

export function addDaysKey(value,days){
  const date=parseDateKey(value);
  if(!date)return '';
  date.setDate(date.getDate()+Number(days||0));
  return localDateKey(date);
}

export function dateKeys(startDate,days){
  const start=parseDateKey(startDate)||new Date();
  const startKey=localDateKey(start);
  return Array.from({length:Math.max(0,Number(days||0))},(_,index)=>addDaysKey(startKey,index));
}

function latestStart(...values){
  return values.filter(Boolean).sort().at(-1)||'';
}

function earliestEnd(...values){
  return values.filter(Boolean).sort()[0]||'';
}

export function internalAssignmentPlanningWindow(db,assignment){
  const project=(db.projects||[]).find(item=>item.id===assignment?.projectId);
  if(!assignment||!project||!projectRequiresStaffing(project))return {active:false,startDate:'',endDate:'',project};
  if(['已取消'].includes(assignment.status))return {active:false,startDate:'',endDate:'',project};
  const roleKey=assignmentRoleKey(assignment);
  const startDate=latestStart(assignment.startDate,project.startDate);
  let endDate=earliestEnd(assignment.endDate,project.ddl);
  if(roleKey==='asset')endDate=earliestEnd(endDate,project.assetCompletionDate);
  if(assignment.status==='已结束'&&!assignment.endDate)return {active:false,startDate,endDate:'',project};
  return {active:true,startDate,endDate,project,roleKey};
}

export function internalAssignmentActiveOnDate(db,assignment,dateKey){
  const window=internalAssignmentPlanningWindow(db,assignment);
  if(!window.active)return false;
  if(window.startDate&&dateKey<window.startDate)return false;
  if(window.endDate&&dateKey>window.endDate)return false;
  if(assignment.status==='已结束'&&assignment.endDate&&dateKey>assignment.endDate)return false;
  return true;
}

export function externalAssignmentActiveOnDate(assignment,dateKey){
  if(!assignment||['已结束','已取消'].includes(assignment.status))return false;
  if(assignment.startDate&&dateKey<assignment.startDate)return false;
  if(assignment.endDate&&dateKey>assignment.endDate)return false;
  return true;
}

export function buildPersonCapacitySeries(db,person,{startDate=localDateKey(new Date()),days=30,workCalendar=workCalendarFromDatabase(db)}={}){
  const standardCapacity=Number(person?.capacity||100);
  const schedulable=person?.employmentStatus==='在岗';
  const internal=(db.assignments||[]).filter(item=>item.personId===person?.id);
  const external=person?.externalAssignments||[];
  return dateKeys(startDate,days).map(date=>{
    const dateStatus=workDateStatus(date,workCalendar);
    if(!dateStatus.working){
      return {
        date,personId:person?.id||'',standardCapacity,effectiveCapacity:0,usage:0,remaining:0,available:0,
        overloaded:false,schedulable,workingDay:false,calendarSource:dateStatus.source,calendarLabel:dateStatus.label,sources:[]
      };
    }
    const sources=[];
    let usage=0;
    for(const assignment of internal){
      if(!internalAssignmentActiveOnDate(db,assignment,date))continue;
      const allocation=Number(assignment.allocation||0);
      usage+=allocation;
      const project=(db.projects||[]).find(item=>item.id===assignment.projectId);
      sources.push({type:'internal',id:assignment.id,projectId:assignment.projectId,name:project?.name||'项目已删除',role:assignment.role||'',allocation});
    }
    for(const assignment of external){
      if(!externalAssignmentActiveOnDate(assignment,date))continue;
      const allocation=Number(assignment.allocation||0);
      usage+=allocation;
      sources.push({type:'external',id:assignment.id,name:assignment.name||'外部项目',role:assignment.role||'',allocation});
    }
    const effectiveCapacity=schedulable?standardCapacity:0;
    const remaining=effectiveCapacity-usage;
    return {
      date,personId:person?.id||'',standardCapacity,effectiveCapacity,usage,
      remaining,available:Math.max(0,remaining),overloaded:remaining<0,schedulable,
      workingDay:true,calendarSource:dateStatus.source,calendarLabel:dateStatus.label,sources
    };
  });
}

export function buildCapacityCalendar(db,{startDate=localDateKey(new Date()),days=30}={}){
  const workCalendar=workCalendarFromDatabase(db);
  return (db.people||[]).map(person=>({
    person,
    days:buildPersonCapacitySeries(db,person,{startDate,days,workCalendar})
  }));
}

export function capacityConflicts(calendar){
  return (calendar||[]).flatMap(entry=>entry.days
    .filter(day=>day.overloaded)
    .map(day=>({person:entry.person,...day}))
  );
}

export function firstDateWithCapacity(series,requiredCapacity,{consecutiveDays=1}={}){
  const required=Math.max(0,Number(requiredCapacity||0));
  const streak=Math.max(1,Number(consecutiveDays||1));
  const workingSeries=(series||[]).filter(day=>day.workingDay!==false);
  for(let index=0;index<workingSeries.length;index++){
    const window=workingSeries.slice(index,index+streak);
    if(window.length<streak)break;
    if(window.every(day=>day.schedulable&&day.available>=required))return window[0].date;
  }
  return '';
}

export function dailyTeamCapacity(db,{startDate=localDateKey(new Date()),days=30}={}){
  const workCalendar=workCalendarFromDatabase(db);
  const calendar=(db.people||[]).map(person=>({person,days:buildPersonCapacitySeries(db,person,{startDate,days,workCalendar})}));
  const keys=dateKeys(startDate,days);
  return keys.map((date,index)=>{
    const rows=calendar.map(entry=>entry.days[index]).filter(Boolean);
    const dateStatus=workDateStatus(date,workCalendar);
    const capacity=rows.reduce((sum,row)=>sum+row.effectiveCapacity,0);
    const usage=rows.reduce((sum,row)=>sum+row.usage,0);
    return {
      date,capacity,usage,remaining:capacity-usage,available:rows.reduce((sum,row)=>sum+row.available,0),
      overloadedPeople:rows.filter(row=>row.overloaded).length,workingDay:dateStatus.working,
      calendarSource:dateStatus.source,calendarLabel:dateStatus.label
    };
  });
}
