import { cloneDatabase } from '../schema/database.mjs';
import { buildPersonCapacitySeries, capacityConflicts, buildCapacityCalendar } from './capacity-calendar.mjs';
import { localDateKey } from '../utils/date.mjs';

export function simulateAssignmentScenario(db,proposal,{startDate=localDateKey(new Date()),days=30}={}){
  const person=(db.people||[]).find(item=>item.id===proposal.personId);
  const project=(db.projects||[]).find(item=>item.id===proposal.projectId);
  if(!person)return {ok:false,error:'人员不存在'};
  if(!project)return {ok:false,error:'项目不存在'};
  const before=buildPersonCapacitySeries(db,person,{startDate,days});
  const scenario=cloneDatabase(db);
  scenario.assignments.unshift({
    id:`scenario:${proposal.personId}:${proposal.projectId}:${proposal.role||'role'}`,
    projectId:proposal.projectId,
    personId:proposal.personId,
    role:proposal.role||'其它支持',
    stage:proposal.stage||'其它',
    allocation:Number(proposal.allocation||0),
    status:proposal.status||'进行中',
    startDate:proposal.startDate||startDate,
    endDate:proposal.endDate||''
  });
  const after=buildPersonCapacitySeries(scenario,person,{startDate,days});
  const changed=after.map((day,index)=>({
    date:day.date,
    beforeUsage:before[index]?.usage||0,
    afterUsage:day.usage,
    beforeAvailable:before[index]?.available||0,
    afterAvailable:day.available,
    overloaded:day.overloaded
  })).filter(day=>day.beforeUsage!==day.afterUsage||day.overloaded);
  const overloadDays=changed.filter(day=>day.overloaded);
  return {
    ok:true,person,project,before,after,changed,overloadDays,
    feasible:overloadDays.length===0,
    maxUsage:after.length?Math.max(...after.map(day=>day.usage)):0,
    minAvailable:after.length?Math.min(...after.map(day=>day.available)):0
  };
}

export function compareAssignmentCandidates(db,proposal,{candidateIds=[],startDate=localDateKey(new Date()),days=30}={}){
  const ids=candidateIds.length?candidateIds:(db.people||[]).filter(person=>person.employmentStatus==='在岗').map(person=>person.id);
  return ids.map(personId=>simulateAssignmentScenario(db,{...proposal,personId},{startDate,days}))
    .filter(result=>result.ok)
    .sort((a,b)=>Number(b.feasible)-Number(a.feasible)||a.overloadDays.length-b.overloadDays.length||b.minAvailable-a.minAvailable||String(a.person.name||'').localeCompare(String(b.person.name||''),'zh-CN'));
}

export function scenarioConflictSummary(db,proposals,{startDate=localDateKey(new Date()),days=30}={}){
  const scenario=cloneDatabase(db);
  proposals.forEach((proposal,index)=>scenario.assignments.unshift({
    id:`scenario:${index}`,
    projectId:proposal.projectId,personId:proposal.personId,role:proposal.role||'其它支持',stage:proposal.stage||'其它',
    allocation:Number(proposal.allocation||0),status:proposal.status||'进行中',startDate:proposal.startDate||startDate,endDate:proposal.endDate||''
  }));
  const calendar=buildCapacityCalendar(scenario,{startDate,days});
  const conflicts=capacityConflicts(calendar);
  return {calendar,conflicts,feasible:conflicts.length===0};
}
