import { needAllocated, personRemainingCapacity, projectRequiresStaffing } from '../core.mjs';
import { forecastTeamCapacity, rankFutureCapacityCandidates } from './capacity-forecast.mjs';
import { buildProjectGanttModel, buildResourceGanttModel, ganttViewport } from './gantt-model.mjs';
import { recommendForStaffingNeed } from './recommendation-engine.mjs';
import { localDateKey } from '../utils/date.mjs';

function severityForConflict(conflict){
  const overload=Math.max(0,Number(conflict.usage||0)-Number(conflict.effectiveCapacity||0));
  if(overload>=50)return 'critical';
  if(overload>=20)return 'high';
  return 'warning';
}

function groupConflicts(conflicts=[]){
  const groups=new Map();
  for(const conflict of conflicts){
    const key=conflict.person?.id||conflict.personId||'';
    if(!groups.has(key))groups.set(key,{person:conflict.person,days:[],maxUsage:0,maxOverload:0});
    const group=groups.get(key);
    group.days.push(conflict);
    group.maxUsage=Math.max(group.maxUsage,Number(conflict.usage||0));
    group.maxOverload=Math.max(group.maxOverload,Math.max(0,Number(conflict.usage||0)-Number(conflict.effectiveCapacity||0)));
  }
  return [...groups.values()].map(group=>({
    ...group,
    severity:group.maxOverload>=50?'critical':group.maxOverload>=20?'high':'warning',
    firstDate:group.days.map(day=>day.date).sort()[0]||'',
    lastDate:group.days.map(day=>day.date).sort().at(-1)||''
  })).sort((a,b)=>b.maxOverload-a.maxOverload||b.days.length-a.days.length||String(a.person?.name||'').localeCompare(String(b.person?.name||''),'zh-CN'));
}

function openNeeds(db){
  return (db.staffingNeeds||[]).filter(need=>{
    const project=(db.projects||[]).find(item=>item.id===need.projectId);
    return projectRequiresStaffing(project)&&needAllocated(db,need)<Number(need.requiredCapacity||0);
  }).map(need=>{
    const project=(db.projects||[]).find(item=>item.id===need.projectId);
    const allocated=needAllocated(db,need);
    return {...need,project,allocated,gap:Math.max(0,Number(need.requiredCapacity||0)-allocated)};
  }).sort((a,b)=>String(a.neededBy||a.project?.ddl||'9999-12-31').localeCompare(String(b.neededBy||b.project?.ddl||'9999-12-31'))||b.gap-a.gap);
}

function buildCapacityHeatmap(teamSeries=[]){
  return teamSeries.map(day=>{
    const utilization=day.capacity?Math.round(day.usage/day.capacity*100):0;
    const level=day.workingDay===false?'off':day.overloadedPeople>0?'overload':utilization>=90?'critical':utilization>=75?'high':utilization>=50?'medium':'low';
    return {...day,utilization,level};
  });
}

export function buildPlanningDashboardModel(db,{
  startDate=localDateKey(new Date()),horizons=[30,60,90],ganttDays=60,ganttViewportDays=21,
  recommendationDays=30,recommendationLimit=3
}={}){
  const teamForecast=forecastTeamCapacity(db,{startDate,horizons});
  const conflicts=teamForecast.conflicts.map(conflict=>({...conflict,severity:severityForConflict(conflict)}));
  const conflictPeople=groupConflicts(conflicts);
  const needs=openNeeds(db);
  const needRecommendations=needs.map(need=>{
    const result=recommendForStaffingNeed(db,need.id,{
      startDate:need.neededBy||startDate,
      days:recommendationDays,
      limit:recommendationLimit
    });
    return {need,project:need.project,candidates:result.ok?result.candidates:[],error:result.ok?'':result.error};
  });
  const resourceGantt=buildResourceGanttModel(db,{startDate,days:ganttDays});
  const projectGantt=buildProjectGanttModel(db,{startDate,days:ganttDays});
  const horizonCards=horizons.map(days=>({days,...teamForecast.windows[days]}));
  const availableCandidates=rankFutureCapacityCandidates(db,{startDate,days:recommendationDays,requiredCapacity:20,consecutiveDays:2}).slice(0,10);
  const peopleSummary=(db.people||[]).map(person=>{
    const calendarEntry=teamForecast.calendar.find(entry=>entry.person?.id===person.id);
    const today=calendarEntry?.days?.[0];
    return {
      person,
      remainingNow:today?today.remaining:personRemainingCapacity(db,person,startDate),
      workingToday:today?.workingDay!==false,
      conflict:conflictPeople.find(item=>item.person?.id===person.id)||null
    };
  });
  return {
    generatedAt:new Date().toISOString(),startDate,horizons,
    summary:{
      people:(db.people||[]).length,
      activeProjects:(db.projects||[]).filter(projectRequiresStaffing).length,
      openNeeds:needs.length,
      conflictPeople:conflictPeople.length,
      conflictDays:new Set(conflicts.map(item=>item.date)).size
    },
    horizonCards,
    heatmap:buildCapacityHeatmap(teamForecast.teamSeries),
    conflicts,
    conflictPeople,
    openNeeds:needs,
    needRecommendations,
    availableCandidates,
    peopleSummary,
    resourceGantt,
    resourceGanttViewport:ganttViewport(resourceGantt,{offset:0,length:ganttViewportDays}),
    projectGantt,
    projectGanttViewport:ganttViewport(projectGantt,{offset:0,length:ganttViewportDays})
  };
}

export function planningDashboardAlerts(model,{limit=10}={}){
  const alerts=[];
  for(const person of model.conflictPeople){
    alerts.push({
      type:'capacity-conflict',severity:person.severity,
      title:`${person.person?.name||'人员'} 未来产能冲突`,
      text:`${person.firstDate} 至 ${person.lastDate} 共 ${person.days.length} 天超载，峰值超出 ${person.maxOverload}%`,
      personId:person.person?.id||''
    });
  }
  for(const item of model.needRecommendations){
    if(item.candidates.length)continue;
    alerts.push({
      type:'staffing-no-candidate',severity:'high',
      title:`${item.project?.name||'项目'} · ${item.need.role} 暂无合适候选`,
      text:`当前仍缺 ${item.need.gap}% 产能`,projectId:item.project?.id||'',needId:item.need.id
    });
  }
  return alerts.sort((a,b)=>({critical:0,high:1,warning:2}[a.severity]??3)-({critical:0,high:1,warning:2}[b.severity]??3)).slice(0,Math.max(1,Number(limit||10)));
}
