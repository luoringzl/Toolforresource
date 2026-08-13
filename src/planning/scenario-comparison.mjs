import { cloneDatabase } from '../schema/database.mjs';
import { executeResourceCommand } from '../services/resource-commands.mjs';
import { buildConfiguredPlanningDashboard } from './planning-runtime.mjs';
import { localDateKey } from '../utils/date.mjs';

export const SCENARIO_OBJECTIVES=Object.freeze({
  balanced:{
    label:'综合改善',
    weights:{openNeedPenalty:45,unresolvedCapacityPenalty:3,conflictPeoplePenalty:85,conflictDayPenalty:18,conflictEventPenalty:4,averageAvailableBonus:.08,peakUsagePenalty:.06}
  },
  staffing:{
    label:'补齐需求优先',
    weights:{openNeedPenalty:90,unresolvedCapacityPenalty:6,conflictPeoplePenalty:55,conflictDayPenalty:10,conflictEventPenalty:2,averageAvailableBonus:.04,peakUsagePenalty:.03}
  },
  lowConflict:{
    label:'降低冲突优先',
    weights:{openNeedPenalty:35,unresolvedCapacityPenalty:2,conflictPeoplePenalty:140,conflictDayPenalty:35,conflictEventPenalty:8,averageAvailableBonus:.1,peakUsagePenalty:.1}
  }
});

function horizonMap(model){
  return Object.fromEntries((model.horizonCards||[]).map(card=>[card.days,{
    days:card.days,
    workingDays:Number(card.workingDays||0),
    utilization:Number(card.utilization||0),
    averageAvailable:Number(card.averageAvailable||0),
    peakUsage:Number(card.peakUsage||0),
    overloadedDays:Number(card.overloadedDays||0)
  }]));
}

export function planningScenarioMetrics(model){
  const unresolvedCapacity=(model.openNeeds||[]).reduce((sum,need)=>sum+Number(need.gap||0),0);
  const conflictEvents=(model.conflicts||[]).length;
  const criticalConflictPeople=(model.conflictPeople||[]).filter(item=>item.severity==='critical').length;
  const horizons=horizonMap(model);
  const primaryHorizon=Object.values(horizons).sort((a,b)=>a.days-b.days)[0]||{averageAvailable:0,peakUsage:0,utilization:0,overloadedDays:0};
  return {
    activeProjects:Number(model.summary?.activeProjects||0),
    openNeeds:Number(model.summary?.openNeeds||0),
    unresolvedCapacity,
    conflictPeople:Number(model.summary?.conflictPeople||0),
    conflictDays:Number(model.summary?.conflictDays||0),
    conflictEvents,
    criticalConflictPeople,
    primaryAverageAvailable:primaryHorizon.averageAvailable,
    primaryPeakUsage:primaryHorizon.peakUsage,
    primaryUtilization:primaryHorizon.utilization,
    primaryOverloadedDays:primaryHorizon.overloadedDays,
    horizons
  };
}

export function scoreScenarioMetrics(metrics,{objective='balanced',weights}={}){
  const preset=SCENARIO_OBJECTIVES[objective]||SCENARIO_OBJECTIVES.balanced;
  const applied={...preset.weights,...(weights||{})};
  const score=
    -metrics.openNeeds*applied.openNeedPenalty-
    metrics.unresolvedCapacity*applied.unresolvedCapacityPenalty-
    metrics.conflictPeople*applied.conflictPeoplePenalty-
    metrics.conflictDays*applied.conflictDayPenalty-
    metrics.conflictEvents*applied.conflictEventPenalty+
    metrics.primaryAverageAvailable*applied.averageAvailableBonus-
    metrics.primaryPeakUsage*applied.peakUsagePenalty;
  return {score:Math.round(score*10)/10,objective:preset.label,weights:applied};
}

function numericDelta(after,before,key){
  return Number(after?.[key]||0)-Number(before?.[key]||0);
}

export function scenarioMetricDelta(baseline,scenario){
  const keys=['activeProjects','openNeeds','unresolvedCapacity','conflictPeople','conflictDays','conflictEvents','criticalConflictPeople','primaryAverageAvailable','primaryPeakUsage','primaryUtilization','primaryOverloadedDays'];
  const delta=Object.fromEntries(keys.map(key=>[key,numericDelta(scenario,baseline,key)]));
  const horizons={};
  const allDays=[...new Set([...Object.keys(baseline.horizons||{}),...Object.keys(scenario.horizons||{})])].map(Number).sort((a,b)=>a-b);
  for(const days of allDays){
    const before=baseline.horizons?.[days]||{};
    const after=scenario.horizons?.[days]||{};
    horizons[days]={
      utilization:numericDelta(after,before,'utilization'),
      averageAvailable:numericDelta(after,before,'averageAvailable'),
      peakUsage:numericDelta(after,before,'peakUsage'),
      overloadedDays:numericDelta(after,before,'overloadedDays')
    };
  }
  return {...delta,horizons};
}

export function applyScenarioCommands(database,commands=[],options={}){
  let current=cloneDatabase(database);
  const results=[];
  const effects=[];
  for(let index=0;index<commands.length;index++){
    const command=commands[index];
    const result=executeResourceCommand(current,command,options);
    if(!result.ok){
      return {ok:false,error:result.error,code:result.code,failedIndex:index,failedCommand:command,results,database:current,effects};
    }
    current=result.database;
    results.push(result);
    effects.push(...(result.effects||[]));
  }
  return {ok:true,database:current,results,effects};
}

function assignmentSignature(item){
  return JSON.stringify([item.projectId,item.personId,item.needId||'',item.role||'',item.stage||'',Number(item.allocation||0),item.status||'',item.startDate||'',item.endDate||'']);
}

export function diffScenarioEntities(before,after){
  const beforeAssignments=new Map((before.assignments||[]).map(item=>[item.id,item]));
  const afterAssignments=new Map((after.assignments||[]).map(item=>[item.id,item]));
  const addedAssignments=[...afterAssignments.values()].filter(item=>!beforeAssignments.has(item.id));
  const removedAssignments=[...beforeAssignments.values()].filter(item=>!afterAssignments.has(item.id));
  const changedAssignments=[...afterAssignments.values()].filter(item=>beforeAssignments.has(item.id)&&assignmentSignature(beforeAssignments.get(item.id))!==assignmentSignature(item));

  const beforePeople=new Map((before.people||[]).map(item=>[item.id,item]));
  const changedPeople=(after.people||[]).filter(person=>{
    const previous=beforePeople.get(person.id);
    return previous&&(previous.employmentStatus!==person.employmentStatus||Number(previous.capacity||100)!==Number(person.capacity||100));
  }).map(person=>({
    personId:person.id,name:person.name,
    beforeStatus:beforePeople.get(person.id).employmentStatus,
    afterStatus:person.employmentStatus,
    beforeCapacity:Number(beforePeople.get(person.id).capacity||100),
    afterCapacity:Number(person.capacity||100)
  }));

  const beforeProjects=new Map((before.projects||[]).map(item=>[item.id,item]));
  const changedProjects=(after.projects||[]).filter(project=>{
    const previous=beforeProjects.get(project.id);
    return previous&&(previous.status!==project.status||previous.startDate!==project.startDate||previous.ddl!==project.ddl);
  }).map(project=>({
    projectId:project.id,name:project.name,
    beforeStatus:beforeProjects.get(project.id).status,afterStatus:project.status,
    beforeStartDate:beforeProjects.get(project.id).startDate||'',afterStartDate:project.startDate||'',
    beforeDdl:beforeProjects.get(project.id).ddl||'',afterDdl:project.ddl||''
  }));

  return {addedAssignments,removedAssignments,changedAssignments,changedPeople,changedProjects};
}

function scenarioExplanations(delta,impact){
  const messages=[];
  if(delta.openNeeds<0)messages.push(`减少 ${Math.abs(delta.openNeeds)} 条待安排需求`);
  else if(delta.openNeeds>0)messages.push(`新增 ${delta.openNeeds} 条待安排需求`);
  if(delta.unresolvedCapacity<0)messages.push(`减少 ${Math.abs(delta.unresolvedCapacity)}% 未解决产能`);
  else if(delta.unresolvedCapacity>0)messages.push(`增加 ${delta.unresolvedCapacity}% 未解决产能`);
  if(delta.conflictPeople<0)messages.push(`减少 ${Math.abs(delta.conflictPeople)} 名冲突人员`);
  else if(delta.conflictPeople>0)messages.push(`增加 ${delta.conflictPeople} 名冲突人员`);
  if(delta.conflictDays<0)messages.push(`减少 ${Math.abs(delta.conflictDays)} 个冲突日`);
  else if(delta.conflictDays>0)messages.push(`增加 ${delta.conflictDays} 个冲突日`);
  if(delta.primaryAverageAvailable>0)messages.push(`近期日均可用产能 +${delta.primaryAverageAvailable}%`);
  else if(delta.primaryAverageAvailable<0)messages.push(`近期日均可用产能 ${delta.primaryAverageAvailable}%`);
  const changedCount=impact.addedAssignments.length+impact.removedAssignments.length+impact.changedAssignments.length;
  if(changedCount)messages.push(`调整 ${changedCount} 条项目分工`);
  if(impact.changedPeople.length)messages.push(`改变 ${impact.changedPeople.length} 人可调度状态/标准产能`);
  if(!messages.length)messages.push('规划核心指标与基线一致');
  return messages;
}

export function comparePlanningScenarios(database,scenarios=[],{
  startDate=localDateKey(new Date()),objective='balanced',weights,horizons,ganttDays,ganttViewportDays,recommendationDays,recommendationLimit,now=new Date()
}={}){
  const dashboardOptions={startDate,...(horizons?{horizons}:{}),...(ganttDays?{ganttDays}:{}),...(ganttViewportDays?{ganttViewportDays}:{}),...(recommendationDays?{recommendationDays}:{}),...(recommendationLimit?{recommendationLimit}:{})};
  const baselineModel=buildConfiguredPlanningDashboard(database,dashboardOptions);
  const baselineMetrics=planningScenarioMetrics(baselineModel);
  const baselineEvaluation=scoreScenarioMetrics(baselineMetrics,{objective,weights});
  const options=[];

  for(const scenario of scenarios){
    const commands=scenario.commands||[];
    const applied=applyScenarioCommands(database,commands,{now});
    if(!applied.ok){
      options.push({id:scenario.id||'',label:scenario.label||scenario.id||'情景',description:scenario.description||'',commands,ok:false,error:applied.error,code:applied.code,failedIndex:applied.failedIndex,failedCommand:applied.failedCommand});
      continue;
    }
    const model=buildConfiguredPlanningDashboard(applied.database,dashboardOptions);
    const metrics=planningScenarioMetrics(model);
    const evaluation=scoreScenarioMetrics(metrics,{objective,weights});
    const delta=scenarioMetricDelta(baselineMetrics,metrics);
    const impact=diffScenarioEntities(database,applied.database);
    options.push({
      id:scenario.id||'',label:scenario.label||scenario.id||'情景',description:scenario.description||'',commands,ok:true,
      database:applied.database,model,metrics,delta,impact,
      scenarioScore:evaluation.score,scoreDelta:Math.round((evaluation.score-baselineEvaluation.score)*10)/10,
      betterThanBaseline:evaluation.score>baselineEvaluation.score,
      explanations:scenarioExplanations(delta,impact)
    });
  }

  const valid=options.filter(item=>item.ok).sort((a,b)=>
    b.scenarioScore-a.scenarioScore||
    a.metrics.unresolvedCapacity-b.metrics.unresolvedCapacity||
    a.metrics.conflictPeople-b.metrics.conflictPeople||
    a.metrics.conflictDays-b.metrics.conflictDays||
    String(a.label).localeCompare(String(b.label),'zh-CN')
  );
  valid.forEach((item,index)=>item.rank=index+1);
  const invalid=options.filter(item=>!item.ok);
  return {
    objective,
    objectiveLabel:(SCENARIO_OBJECTIVES[objective]||SCENARIO_OBJECTIVES.balanced).label,
    baseline:{model:baselineModel,metrics:baselineMetrics,scenarioScore:baselineEvaluation.score},
    options:[...valid,...invalid],
    recommended:valid[0]||null,
    generatedAt:new Date().toISOString()
  };
}

export function scenarioCommands(option){
  return [...(option?.commands||[])];
}
