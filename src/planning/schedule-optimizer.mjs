import { generateConfiguredAutoScheduleDraft } from './planning-runtime.mjs';
import { autoScheduleDraftCommands } from './auto-scheduler.mjs';

export const SCHEDULE_STRATEGIES=Object.freeze([
  {id:'balanced',label:'均衡方案',description:'沿用当前 V7 默认分配块与人数限制，兼顾集中度和可排性。',options:{}},
  {id:'concentrated',label:'少人集中',description:'尽量提高单人投入并限制单需求人数，减少沟通与交接。',options:{maxChunk:100,minChunk:25,step:25,maxPeoplePerNeed:2}},
  {id:'distributed',label:'分散低负荷',description:'降低单人投入上限，用更多人员分摊需求，优先保留个人余量。',options:{maxChunk:30,minChunk:10,step:10,maxPeoplePerNeed:8}},
  {id:'flexible',label:'细粒度灵活',description:'使用更小分配步长和更高人数上限，寻找更容易塞入现有产能的组合。',options:{maxChunk:50,minChunk:5,step:5,maxPeoplePerNeed:8}}
]);

export const OPTIMIZATION_OBJECTIVES=Object.freeze({
  balanced:{
    label:'综合最优',
    weights:{resolvedNeedBonus:35,unresolvedCapacityPenalty:12,conflictPenalty:120,delayDayPenalty:4,delayedProposalPenalty:12,peoplePenalty:1.5,riskPenalty:5,recommendationScoreBonus:.35}
  },
  onTime:{
    label:'按期优先',
    weights:{resolvedNeedBonus:40,unresolvedCapacityPenalty:15,conflictPenalty:150,delayDayPenalty:10,delayedProposalPenalty:30,peoplePenalty:.25,riskPenalty:6,recommendationScoreBonus:.25}
  },
  lowRisk:{
    label:'低风险优先',
    weights:{resolvedNeedBonus:35,unresolvedCapacityPenalty:15,conflictPenalty:220,delayDayPenalty:5,delayedProposalPenalty:15,peoplePenalty:.5,riskPenalty:14,recommendationScoreBonus:.5}
  },
  concentrated:{
    label:'少人集中优先',
    weights:{resolvedNeedBonus:30,unresolvedCapacityPenalty:12,conflictPenalty:150,delayDayPenalty:4,delayedProposalPenalty:10,peoplePenalty:10,riskPenalty:5,recommendationScoreBonus:.25}
  }
});

function average(values=[]){
  return values.length?values.reduce((sum,value)=>sum+Number(value||0),0)/values.length:0;
}

function draftSignature(draft){
  return JSON.stringify((draft?.proposals||[]).map(item=>[item.needId,item.personId,item.allocation,item.startDate,item.endDate]).sort());
}

export function scheduleDraftMetrics(draft={}){
  const proposals=draft.proposals||[];
  const unresolved=draft.unresolved||[];
  const conflicts=draft.conflicts||[];
  const totalDelayDays=proposals.reduce((sum,item)=>sum+Number(item.delayDays||0),0);
  const nonDelayRisks=proposals.reduce((sum,item)=>sum+(item.risks||[]).filter(risk=>!String(risk).includes('晚于期望到岗')).length,0);
  return {
    requestedNeeds:Number(draft.requestedNeeds||0),
    resolvedNeeds:Number(draft.resolvedNeeds||0),
    proposalCount:proposals.length,
    proposedPeople:new Set(proposals.map(item=>item.personId)).size,
    allocatedCapacity:proposals.reduce((sum,item)=>sum+Number(item.allocation||0),0),
    unresolvedNeeds:unresolved.length,
    unresolvedCapacity:unresolved.reduce((sum,item)=>sum+Number(item.remaining||0),0),
    conflictCount:conflicts.length,
    delayedProposals:proposals.filter(item=>Number(item.delayDays||0)>0).length,
    totalDelayDays,
    maxDelayDays:proposals.length?Math.max(...proposals.map(item=>Number(item.delayDays||0))):0,
    riskCount:nonDelayRisks,
    averageRecommendationScore:Math.round(average(proposals.map(item=>item.score))*10)/10
  };
}

export function evaluateScheduleDraft(draft,{objective='balanced',weights}={}){
  const preset=OPTIMIZATION_OBJECTIVES[objective]||OPTIMIZATION_OBJECTIVES.balanced;
  const applied={...preset.weights,...(weights||{})};
  const metrics=scheduleDraftMetrics(draft);
  const score=
    metrics.resolvedNeeds*applied.resolvedNeedBonus-
    metrics.unresolvedCapacity*applied.unresolvedCapacityPenalty-
    metrics.conflictCount*applied.conflictPenalty-
    metrics.totalDelayDays*applied.delayDayPenalty-
    metrics.delayedProposals*applied.delayedProposalPenalty-
    metrics.proposedPeople*applied.peoplePenalty-
    metrics.riskCount*applied.riskPenalty+
    metrics.averageRecommendationScore*applied.recommendationScoreBonus;
  const explanations=[];
  explanations.push(`已解决 ${metrics.resolvedNeeds}/${metrics.requestedNeeds} 条需求`);
  if(metrics.unresolvedCapacity>0)explanations.push(`仍缺 ${metrics.unresolvedCapacity}% 产能`);
  else explanations.push('无未解决产能缺口');
  if(metrics.conflictCount>0)explanations.push(`${metrics.conflictCount} 个产能冲突`);
  else explanations.push('无产能冲突');
  if(metrics.delayedProposals>0)explanations.push(`${metrics.delayedProposals} 条延期，共 ${metrics.totalDelayDays} 天`);
  else explanations.push('全部建议按期');
  explanations.push(`使用 ${metrics.proposedPeople} 人 · 平均候选评分 ${metrics.averageRecommendationScore}`);
  return {optimizerScore:Math.round(score*10)/10,objective:preset.label,weights:applied,metrics,explanations};
}

export function optimizeSchedule(db,{
  objective='balanced',strategies=SCHEDULE_STRATEGIES,needIds=[],startDate,weights,...sharedOptions
}={}){
  const options=[];
  const signatures=new Set();
  for(const strategy of strategies){
    const draft=generateConfiguredAutoScheduleDraft(db,{
      ...sharedOptions,
      ...strategy.options,
      ...(startDate?{startDate}:{}),
      needIds
    });
    const signature=draftSignature(draft);
    if(signatures.has(signature))continue;
    signatures.add(signature);
    const evaluation=evaluateScheduleDraft(draft,{objective,weights});
    options.push({
      id:strategy.id,label:strategy.label,description:strategy.description,
      strategyOptions:{...strategy.options},draft,...evaluation
    });
  }
  options.sort((a,b)=>
    b.optimizerScore-a.optimizerScore||
    a.metrics.unresolvedCapacity-b.metrics.unresolvedCapacity||
    a.metrics.conflictCount-b.metrics.conflictCount||
    a.metrics.totalDelayDays-b.metrics.totalDelayDays||
    a.metrics.proposedPeople-b.metrics.proposedPeople||
    String(a.label).localeCompare(String(b.label),'zh-CN')
  );
  options.forEach((item,index)=>item.rank=index+1);
  return {
    objective,
    objectiveLabel:(OPTIMIZATION_OBJECTIVES[objective]||OPTIMIZATION_OBJECTIVES.balanced).label,
    options,
    recommended:options[0]||null,
    generatedAt:new Date().toISOString()
  };
}

export function scheduleOptionCommands(option){
  return autoScheduleDraftCommands(option?.draft||option);
}
