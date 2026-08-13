import { needAllocated, projectRequiresStaffing } from '../core.mjs';
import { cloneDatabase } from '../schema/database.mjs';
import { generateConfiguredAutoScheduleDraft, resolvePlanningRuntimeConfig } from './planning-runtime.mjs';
import { calculateProjectCriticalPath, dependencyReadiness } from './project-dependencies.mjs';
import { localDateKey } from '../utils/date.mjs';

function maxDate(...values){return values.filter(Boolean).sort().at(-1)||'';}

function openNeeds(db){
  return (db.staffingNeeds||[]).map(need=>{
    const project=(db.projects||[]).find(item=>item.id===need.projectId);
    if(!project||!projectRequiresStaffing(project))return null;
    const allocated=needAllocated(db,need);
    const gap=Math.max(0,Number(need.requiredCapacity||0)-allocated);
    return gap>0?{need,project,allocated,gap}:null;
  }).filter(Boolean);
}

function emptyDraft(startDate,days){
  return {
    generatedAt:new Date().toISOString(),startDate,days,requestedNeeds:0,resolvedNeeds:0,
    proposals:[],unresolved:[],feasible:true,conflicts:[],
    summary:{proposalCount:0,proposedPeople:0,allocatedCapacity:0,delayedProposals:0,maxDelayDays:0,unresolvedCapacity:0}
  };
}

export function buildProjectDependencySchedulingStates(db,{startDate=localDateKey(new Date())}={}){
  const critical=calculateProjectCriticalPath(db,{startDate});
  if(!critical.ok)return {ok:false,error:critical.errors?.[0]?.message||'项目依赖网络无效',critical,states:[]};
  const nodeById=new Map(critical.nodes.map(node=>[node.project.id,node]));
  const states=(db.projects||[]).map(project=>{
    const readiness=dependencyReadiness(db,project.id);
    const node=nodeById.get(project.id)||null;
    const earliestStaffingDate=maxDate(startDate,project.startDate,node?.plannedStartDate);
    return {
      project,readiness,node,
      readyNow:Boolean(readiness.ok&&readiness.ready),
      blocked:Boolean(readiness.ok&&!readiness.ready),
      blockers:readiness.blockers||[],
      earliestStaffingDate,
      critical:Boolean(node?.critical),
      lateByWorkingDays:Number(node?.lateByWorkingDays||0)
    };
  });
  return {ok:true,critical,states};
}

export function criticalPathStaffingAlerts(db,{startDate=localDateKey(new Date())}={}){
  const stateModel=buildProjectDependencySchedulingStates(db,{startDate});
  if(!stateModel.ok)return [{type:'dependency-network-invalid',severity:'critical',title:'项目依赖网络无效',text:stateModel.error}];
  const needs=openNeeds(db);
  const needsByProject=new Map();
  for(const item of needs){
    if(!needsByProject.has(item.project.id))needsByProject.set(item.project.id,[]);
    needsByProject.get(item.project.id).push(item);
  }
  const alerts=[];
  for(const state of stateModel.states){
    const projectNeeds=needsByProject.get(state.project.id)||[];
    const gap=projectNeeds.reduce((sum,item)=>sum+item.gap,0);
    if(state.lateByWorkingDays>0){
      alerts.push({
        type:'critical-path-deadline',severity:'critical',projectId:state.project.id,
        title:`${state.project.name} 关键路径晚于 DDL`,
        text:`按依赖网络预计晚 ${state.lateByWorkingDays} 个工作日${gap?`，同时仍缺 ${gap}% 人员产能`:''}`,
        lateByWorkingDays:state.lateByWorkingDays,gap
      });
    }
    if(state.critical&&projectNeeds.length){
      alerts.push({
        type:'critical-path-staffing-gap',severity:state.blocked?'warning':'high',projectId:state.project.id,
        title:`${state.project.name} 关键路径存在人员缺口`,
        text:state.blocked?`仍缺 ${gap}% 产能，但当前被 ${state.blockers.length} 个前置条件阻塞`:`仍缺 ${gap}% 产能，建议优先补齐`,
        gap,blocked:state.blocked,needIds:projectNeeds.map(item=>item.need.id)
      });
    }
  }
  return alerts;
}

export function buildDependencyAwareStaffingPlan(db,{
  startDate=localDateKey(new Date()),includeBlockedPreview=true,...autoOptions
}={}){
  const runtime=resolvePlanningRuntimeConfig(db,{startDate,...autoOptions});
  const stateModel=buildProjectDependencySchedulingStates(db,{startDate});
  if(!stateModel.ok){
    return {ok:false,error:stateModel.error,stateModel,eligibleNeeds:[],blockedNeeds:[],draft:emptyDraft(startDate,runtime.autoScheduleDays),alerts:criticalPathStaffingAlerts(db,{startDate})};
  }
  const stateByProject=new Map(stateModel.states.map(state=>[state.project.id,state]));
  const needs=openNeeds(db);
  const eligibleNeeds=[];
  const blockedNeeds=[];
  for(const item of needs){
    const state=stateByProject.get(item.project.id);
    const entry={
      ...item,state,
      earliestStaffingDate:state?.earliestStaffingDate||maxDate(startDate,item.project.startDate),
      critical:Boolean(state?.critical),
      blockers:state?.blockers||[]
    };
    if(state?.readyNow)eligibleNeeds.push(entry);else blockedNeeds.push(entry);
  }

  let draft=emptyDraft(startDate,runtime.autoScheduleDays);
  if(eligibleNeeds.length){
    const simulated=cloneDatabase(db);
    for(const item of eligibleNeeds){
      const need=simulated.staffingNeeds.find(candidate=>candidate.id===item.need.id);
      if(need)need.neededBy=maxDate(need.neededBy,startDate,item.earliestStaffingDate);
    }
    draft=generateConfiguredAutoScheduleDraft(simulated,{
      ...autoOptions,startDate,needIds:eligibleNeeds.map(item=>item.need.id)
    });
  }

  const blockedPreview=includeBlockedPreview?blockedNeeds.map(item=>({
    needId:item.need.id,projectId:item.project.id,projectName:item.project.name,role:item.need.role,gap:item.gap,
    earliestStaffingDate:item.earliestStaffingDate,critical:item.critical,
    blockers:item.blockers.map(blocker=>({
      predecessorId:blocker.predecessorId,type:blocker.type,lagDays:blocker.lagDays,
      predecessorName:blocker.predecessor?.name||'前置项目已删除',predecessorStatus:blocker.predecessor?.status||''
    }))
  })):[];

  return {
    ok:true,startDate,stateModel,
    eligibleNeeds,blockedNeeds,blockedPreview,draft,
    alerts:criticalPathStaffingAlerts(db,{startDate}),
    summary:{
      openNeeds:needs.length,eligibleNeeds:eligibleNeeds.length,blockedNeeds:blockedNeeds.length,
      criticalOpenNeeds:needs.filter(item=>stateByProject.get(item.project.id)?.critical).length,
      blockedCapacity:blockedNeeds.reduce((sum,item)=>sum+item.gap,0),
      eligibleCapacity:eligibleNeeds.reduce((sum,item)=>sum+item.gap,0),
      proposedCapacity:Number(draft.summary?.allocatedCapacity||0)
    },
    fullySchedulableNow:blockedNeeds.length===0&&draft.feasible
  };
}
