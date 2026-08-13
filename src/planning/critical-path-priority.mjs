import { cloneDatabase } from '../schema/database.mjs';
import { generateConfiguredAutoScheduleDraft, resolvePlanningRuntimeConfig } from './planning-runtime.mjs';
import { validateAutoScheduleDraft } from './auto-scheduler.mjs';
import { buildDependencyAwareStaffingPlan } from './dependency-aware-scheduling.mjs';
import { SCHEDULE_STRATEGIES, OPTIMIZATION_OBJECTIVES, evaluateScheduleDraft } from './schedule-optimizer.mjs';
import { localDateKey } from '../utils/date.mjs';

function projectPriorityScore(priority=''){
  const match=String(priority||'').toUpperCase().match(/P([0-3])/);
  return ({0:400,1:250,2:100,3:0})[match?.[1]]??0;
}

function maxDate(...values){return values.filter(Boolean).sort().at(-1)||'';}

function needPriority(item){
  const node=item.state?.node;
  const criticalBonus=node?.critical?1000:0;
  const lateBonus=Math.max(0,Number(node?.lateByWorkingDays||0))*250;
  const businessPriority=projectPriorityScore(item.project?.priority);
  const floatPenalty=Math.max(0,Number(node?.totalFloatDays||0))*20;
  const gapBonus=Math.min(100,Math.max(0,Number(item.gap||0)))*0.25;
  const score=criticalBonus+lateBonus+businessPriority-floatPenalty+gapBonus;
  const reasons=[];
  if(node?.critical)reasons.push('关键路径');
  if(Number(node?.lateByWorkingDays||0)>0)reasons.push(`预计晚 ${node.lateByWorkingDays} 个工作日`);
  if(businessPriority)reasons.push(item.project?.priority||'高优先级');
  if(Number(node?.totalFloatDays||0)>0)reasons.push(`浮动 ${node.totalFloatDays} 个工作日`);
  reasons.push(`缺口 ${item.gap}%`);
  return {score:Math.round(score*10)/10,reasons};
}

export function buildCriticalPathNeedPriorityModel(db,{startDate=localDateKey(new Date())}={}){
  const plan=buildDependencyAwareStaffingPlan(db,{startDate,includeBlockedPreview:true});
  if(!plan.ok)return {ok:false,error:plan.error,plan,priorities:[],scores:{}};
  const priorities=plan.eligibleNeeds.map(item=>{
    const priority=needPriority(item);
    return {...item,priorityScore:priority.score,priorityReasons:priority.reasons};
  }).sort((a,b)=>
    b.priorityScore-a.priorityScore||
    String(a.need.neededBy||a.project.ddl||'9999-12-31').localeCompare(String(b.need.neededBy||b.project.ddl||'9999-12-31'))||
    b.gap-a.gap||String(a.project.name||'').localeCompare(String(b.project.name||''),'zh-CN')
  );
  return {ok:true,plan,priorities,scores:Object.fromEntries(priorities.map(item=>[item.need.id,item.priorityScore]))};
}

function reserveProposals(simulated,proposals=[],sequenceStart=0){
  proposals.forEach((proposal,index)=>{
    simulated.assignments.unshift({
      id:`priority-draft:${proposal.needId}:${proposal.personId}:${sequenceStart+index+1}`,
      needId:proposal.needId,projectId:proposal.projectId,personId:proposal.personId,role:proposal.role,
      stage:proposal.stage||'其它',allocation:Number(proposal.allocation||0),status:'进行中',
      startDate:proposal.startDate||'',endDate:proposal.endDate||''
    });
  });
}

function mergeDrafts(db,drafts,priorityModel,{startDate,days}){
  const proposals=drafts.flatMap(item=>item.draft.proposals||[]);
  const unresolved=drafts.flatMap(item=>item.draft.unresolved||[]);
  const validation=validateAutoScheduleDraft(db,{proposals},{startDate,days});
  return {
    generatedAt:new Date().toISOString(),startDate,days,
    requestedNeeds:priorityModel.priorities.length,
    resolvedNeeds:priorityModel.priorities.length-new Set(unresolved.map(item=>item.needId)).size,
    proposals,unresolved,
    feasible:validation.feasible&&unresolved.length===0,
    conflicts:validation.conflicts,
    priorityOrder:priorityModel.priorities.map(item=>({
      needId:item.need.id,projectId:item.project.id,projectName:item.project.name,role:item.need.role,
      priorityScore:item.priorityScore,reasons:[...item.priorityReasons]
    })),
    summary:{
      proposalCount:proposals.length,proposedPeople:new Set(proposals.map(item=>item.personId)).size,
      allocatedCapacity:proposals.reduce((sum,item)=>sum+Number(item.allocation||0),0),
      delayedProposals:proposals.filter(item=>Number(item.delayDays||0)>0).length,
      maxDelayDays:proposals.length?Math.max(...proposals.map(item=>Number(item.delayDays||0))):0,
      unresolvedCapacity:unresolved.reduce((sum,item)=>sum+Number(item.remaining||0),0)
    }
  };
}

export function generateCriticalPathPriorityDraft(db,{
  startDate=localDateKey(new Date()),...options
}={}){
  const priorityModel=buildCriticalPathNeedPriorityModel(db,{startDate});
  const runtime=resolvePlanningRuntimeConfig(db,{startDate,...options});
  if(!priorityModel.ok)return {ok:false,error:priorityModel.error,priorityModel,draft:{proposals:[],unresolved:[],feasible:false,summary:{proposalCount:0,allocatedCapacity:0,unresolvedCapacity:0}}};
  const simulated=cloneDatabase(db);
  const drafts=[];
  let sequence=0;
  for(const item of priorityModel.priorities){
    const need=simulated.staffingNeeds.find(candidate=>candidate.id===item.need.id);
    if(need)need.neededBy=maxDate(need.neededBy,startDate,item.earliestStaffingDate);
    const draft=generateConfiguredAutoScheduleDraft(simulated,{...options,startDate,needIds:[item.need.id]});
    drafts.push({item,draft});
    reserveProposals(simulated,draft.proposals,sequence);
    sequence+=draft.proposals.length;
  }
  return {
    ok:true,priorityModel,
    draft:mergeDrafts(db,drafts,priorityModel,{startDate,days:runtime.autoScheduleDays})
  };
}

function signature(draft){
  return JSON.stringify((draft?.proposals||[]).map(item=>[item.needId,item.personId,item.allocation,item.startDate,item.endDate]).sort());
}

export function optimizeCriticalPathPrioritySchedule(db,{
  objective='balanced',strategies=SCHEDULE_STRATEGIES,startDate=localDateKey(new Date()),weights,...sharedOptions
}={}){
  const options=[];
  const seen=new Set();
  let priorityModel=null;
  for(const strategy of strategies){
    const result=generateCriticalPathPriorityDraft(db,{...sharedOptions,...strategy.options,startDate});
    priorityModel=result.priorityModel;
    if(!result.ok)return {ok:false,error:result.error,priorityModel,objective,options:[],recommended:null};
    const key=signature(result.draft);
    if(seen.has(key))continue;
    seen.add(key);
    const evaluation=evaluateScheduleDraft(result.draft,{objective,weights});
    options.push({
      id:strategy.id,label:strategy.label,description:strategy.description,strategyOptions:{...strategy.options},
      draft:result.draft,...evaluation
    });
  }
  options.sort((a,b)=>
    b.optimizerScore-a.optimizerScore||a.metrics.unresolvedCapacity-b.metrics.unresolvedCapacity||
    a.metrics.conflictCount-b.metrics.conflictCount||a.metrics.totalDelayDays-b.metrics.totalDelayDays||
    a.metrics.proposedPeople-b.metrics.proposedPeople||String(a.label).localeCompare(String(b.label),'zh-CN')
  );
  options.forEach((item,index)=>item.rank=index+1);
  const preset=OPTIMIZATION_OBJECTIVES[objective]||OPTIMIZATION_OBJECTIVES.balanced;
  return {ok:true,objective,objectiveLabel:preset.label,priorityModel,options,recommended:options[0]||null,generatedAt:new Date().toISOString()};
}
