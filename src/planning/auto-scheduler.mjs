import { needAllocated, projectRequiresStaffing } from '../core.mjs';
import { cloneDatabase } from '../schema/database.mjs';
import { recommendAssignmentCandidates } from './recommendation-engine.mjs';
import { scenarioConflictSummary } from './scenario-planner.mjs';
import { localDateKey } from '../utils/date.mjs';

function projectPriorityRank(priority=''){
  const match=String(priority).toUpperCase().match(/P([0-3])/);
  return match?Number(match[1]):4;
}

function parseDateKey(value){
  const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match)return null;
  return new Date(Number(match[1]),Number(match[2])-1,Number(match[3]));
}

function daysBetween(a,b){
  const first=parseDateKey(a),second=parseDateKey(b);
  if(!first||!second||second<=first)return 0;
  return Math.round((second-first)/86400000);
}

function openNeeds(db,needIds=[]){
  const filterIds=new Set(needIds.filter(Boolean));
  return (db.staffingNeeds||[]).filter(need=>{
    if(filterIds.size&&!filterIds.has(need.id))return false;
    const project=(db.projects||[]).find(item=>item.id===need.projectId);
    return projectRequiresStaffing(project)&&needAllocated(db,need)<Number(need.requiredCapacity||0);
  }).map(need=>{
    const project=(db.projects||[]).find(item=>item.id===need.projectId);
    return {need,project,gap:Math.max(0,Number(need.requiredCapacity||0)-needAllocated(db,need))};
  }).sort((a,b)=>{
    const dateA=a.need.neededBy||a.project?.ddl||'9999-12-31';
    const dateB=b.need.neededBy||b.project?.ddl||'9999-12-31';
    return String(dateA).localeCompare(String(dateB))||projectPriorityRank(a.project?.priority)-projectPriorityRank(b.project?.priority)||b.gap-a.gap;
  });
}

function allocationCandidates(remaining,{maxChunk,minChunk,step}){
  const top=Math.min(100,Math.max(1,Number(maxChunk||50)),remaining);
  const floor=Math.min(top,Math.max(1,Number(minChunk||10)));
  const values=[];
  let value=top;
  while(value>=floor){
    values.push(value);
    value-=Math.max(1,Number(step||10));
  }
  if(values.at(-1)!==floor)values.push(floor);
  if(remaining<Number(minChunk||10)&&!values.includes(remaining))values.unshift(remaining);
  return [...new Set(values.map(item=>Math.max(1,Math.min(100,Math.round(item)))))]
    .sort((a,b)=>b-a);
}

function addDraftAssignment(db,proposal,index){
  db.assignments.unshift({
    id:`draft:${proposal.needId}:${proposal.personId}:${index}`,
    needId:proposal.needId,
    projectId:proposal.projectId,
    personId:proposal.personId,
    role:proposal.role,
    stage:proposal.stage,
    allocation:proposal.allocation,
    status:'进行中',
    startDate:proposal.startDate,
    endDate:proposal.endDate||''
  });
}

export function generateAutoScheduleDraft(db,{
  needIds=[],startDate=localDateKey(new Date()),days=60,maxChunk=50,minChunk=10,step=10,
  maxPeoplePerNeed=4,recommendationLimit=20,consecutiveDays=1
}={}){
  const simulated=cloneDatabase(db);
  const needs=openNeeds(simulated,needIds);
  const proposals=[];
  const unresolved=[];

  for(const item of needs){
    const {need,project}=item;
    const usedPeople=new Set();
    let remaining=Math.max(0,Number(need.requiredCapacity||0)-needAllocated(simulated,need));
    let slots=0;
    while(remaining>0&&slots<Math.max(1,Number(maxPeoplePerNeed||4))){
      let chosen=null;
      for(const allocation of allocationCandidates(remaining,{maxChunk,minChunk,step})){
        const planningStart=need.neededBy||startDate;
        const candidates=recommendAssignmentCandidates(simulated,{
          projectId:project.id,
          role:need.role,
          stage:need.stage||'其它',
          allocation,
          startDate:planningStart,
          endDate:project.ddl||''
        },{startDate:planningStart,days,consecutiveDays,limit:recommendationLimit});
        const candidate=candidates.find(entry=>!usedPeople.has(entry.person.id)&&entry.feasible&&entry.firstAvailableDate);
        if(candidate){chosen={candidate,allocation,planningStart};break;}
      }
      if(!chosen)break;
      const delayDays=daysBetween(chosen.planningStart,chosen.candidate.firstAvailableDate);
      const proposal={
        needId:need.id,
        projectId:project.id,
        projectName:project.name,
        personId:chosen.candidate.person.id,
        personName:chosen.candidate.person.name,
        role:need.role,
        stage:need.stage||'其它',
        allocation:chosen.allocation,
        requestedStartDate:chosen.planningStart,
        startDate:chosen.candidate.firstAvailableDate,
        endDate:project.ddl||'',
        meetsRequestedStart:delayDays===0,
        delayDays,
        score:chosen.candidate.score,
        reasons:[...chosen.candidate.reasons],
        risks:[...chosen.candidate.risks,...(delayDays>0?[`晚于期望到岗 ${delayDays} 天`]:[])]
      };
      proposals.push(proposal);
      usedPeople.add(proposal.personId);
      addDraftAssignment(simulated,proposal,proposals.length);
      remaining=Math.max(0,Number(need.requiredCapacity||0)-needAllocated(simulated,need));
      slots+=1;
    }
    if(remaining>0){
      unresolved.push({
        needId:need.id,projectId:project.id,projectName:project.name,role:need.role,
        remaining,reason:slots>=Number(maxPeoplePerNeed||4)?'已达到单需求最大建议人数':'当前规划窗口内没有可行候选'
      });
    }
  }

  const validation=validateAutoScheduleDraft(db,{proposals},{startDate,days});
  return {
    generatedAt:new Date().toISOString(),startDate,days,
    requestedNeeds:needs.length,
    resolvedNeeds:needs.length-unresolved.length,
    proposals,unresolved,
    feasible:validation.feasible&&unresolved.length===0,
    conflicts:validation.conflicts,
    summary:{
      proposalCount:proposals.length,
      proposedPeople:new Set(proposals.map(item=>item.personId)).size,
      allocatedCapacity:proposals.reduce((sum,item)=>sum+Number(item.allocation||0),0),
      delayedProposals:proposals.filter(item=>!item.meetsRequestedStart).length,
      maxDelayDays:proposals.length?Math.max(...proposals.map(item=>item.delayDays||0)):0,
      unresolvedCapacity:unresolved.reduce((sum,item)=>sum+Number(item.remaining||0),0)
    }
  };
}

export function validateAutoScheduleDraft(db,draft,{startDate=localDateKey(new Date()),days=60}={}){
  const proposals=(draft?.proposals||[]).map(item=>({
    personId:item.personId,projectId:item.projectId,role:item.role,stage:item.stage,
    allocation:item.allocation,startDate:item.startDate,endDate:item.endDate
  }));
  const scenario=scenarioConflictSummary(db,proposals,{startDate,days});
  const invalid=[];
  for(const proposal of draft?.proposals||[]){
    if(!(db.people||[]).some(person=>person.id===proposal.personId))invalid.push({proposal,reason:'人员不存在'});
    if(!(db.projects||[]).some(project=>project.id===proposal.projectId))invalid.push({proposal,reason:'项目不存在'});
    if(Number(proposal.allocation||0)<=0||Number(proposal.allocation||0)>100)invalid.push({proposal,reason:'分配产能无效'});
    if(proposal.endDate&&proposal.startDate&&proposal.startDate>proposal.endDate)invalid.push({proposal,reason:'建议开始日期晚于项目结束日期'});
  }
  return {feasible:scenario.feasible&&invalid.length===0,conflicts:scenario.conflicts,invalid};
}

export function autoScheduleDraftCommands(draft){
  return (draft?.proposals||[]).map(proposal=>({
    type:'assignment.assign',
    payload:{
      needId:proposal.needId,projectId:proposal.projectId,personId:proposal.personId,
      role:proposal.role,stage:proposal.stage,allocation:proposal.allocation,
      status:'进行中',startDate:proposal.startDate,endDate:proposal.endDate||''
    }
  }));
}
