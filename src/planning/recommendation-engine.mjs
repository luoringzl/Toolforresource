import {
  needAllocated,
  personPositionMatchesRole,
  personSkillMatchesRole,
  projectRequiresStaffing
} from '../core.mjs';
import { buildPersonCapacitySeries, firstDateWithCapacity } from './capacity-calendar.mjs';
import { simulateAssignmentScenario } from './scenario-planner.mjs';
import { localDateKey } from '../utils/date.mjs';

export const RECOMMENDATION_WEIGHTS=Object.freeze({
  positionMatch:35,
  skillMatch:20,
  feasible:30,
  immediatelyAvailable:10,
  availabilityQuality:15,
  overloadDayPenalty:8,
  delayDayPenalty:1
});

function parseDateKey(value){
  const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match)return null;
  return new Date(Number(match[1]),Number(match[2])-1,Number(match[3]));
}

function daysBetween(a,b){
  const first=parseDateKey(a),second=parseDateKey(b);
  if(!first||!second)return 0;
  return Math.max(0,Math.round((second-first)/86400000));
}

function workingSeries(series=[]){
  return series.filter(day=>day.workingDay!==false);
}

function seriesWithinEndDate(series=[],endDate=''){
  if(!endDate)return series;
  return series.filter(day=>!day.date||day.date<=endDate);
}

function availabilityQuality(series,required){
  const working=workingSeries(series);
  if(!working.length)return 0;
  const average=working.reduce((sum,day)=>sum+day.available,0)/working.length;
  if(required<=0)return Math.min(1,average/100);
  return Math.min(1,average/Math.max(required,1));
}

export function scoreAssignmentCandidate(db,person,proposal,{startDate=localDateKey(new Date()),days=30,consecutiveDays=1}={}){
  if(!person||person.employmentStatus!=='在岗')return null;
  const role=proposal.role||'';
  const requiredCapacity=Math.max(1,Number(proposal.allocation||proposal.requiredCapacity||20));
  const planningStart=proposal.startDate||startDate;
  const planningEnd=proposal.endDate||'';
  const positionMatch=personPositionMatchesRole(person,role);
  const skillMatch=personSkillMatchesRole(person,role);
  const series=buildPersonCapacitySeries(db,person,{startDate:planningStart,days});
  const eligibleSeries=seriesWithinEndDate(series,planningEnd);
  const working=workingSeries(eligibleSeries);
  const firstAvailableDate=firstDateWithCapacity(eligibleSeries,requiredCapacity,{consecutiveDays});
  const scenario=simulateAssignmentScenario(db,{
    personId:person.id,projectId:proposal.projectId,role,
    stage:proposal.stage||'其它',allocation:requiredCapacity,
    startDate:firstAvailableDate||planningStart,
    endDate:planningEnd
  },{startDate:planningStart,days});
  if(!scenario.ok)return null;

  let score=0;
  const reasons=[];
  const risks=[];
  if(positionMatch){score+=RECOMMENDATION_WEIGHTS.positionMatch;reasons.push('职位直接匹配');}
  if(skillMatch){score+=RECOMMENDATION_WEIGHTS.skillMatch;reasons.push('技能标签匹配');}
  if(scenario.feasible){score+=RECOMMENDATION_WEIGHTS.feasible;reasons.push('规划窗口内无超载冲突');}
  else{
    const penalty=Math.min(40,scenario.overloadDays.length*RECOMMENDATION_WEIGHTS.overloadDayPenalty);
    score-=penalty;risks.push(`预计 ${scenario.overloadDays.length} 个工作日超载`);
  }
  const quality=availabilityQuality(eligibleSeries,requiredCapacity);
  score+=Math.round(quality*RECOMMENDATION_WEIGHTS.availabilityQuality);
  if(firstAvailableDate===planningStart){score+=RECOMMENDATION_WEIGHTS.immediatelyAvailable;reasons.push('可按期满足所需产能');}
  else if(firstAvailableDate){
    const delay=daysBetween(planningStart,firstAvailableDate);
    score-=Math.min(20,delay*RECOMMENDATION_WEIGHTS.delayDayPenalty);
    reasons.push(`最早 ${firstAvailableDate} 可满足产能`);
  }else{
    score-=25;
    risks.push(planningEnd?`项目结束日前无连续可用产能（DDL ${planningEnd}）`:`${days} 天窗口内无连续可用产能`);
  }
  if(!positionMatch&&!skillMatch)risks.push('岗位与技能均非直接匹配');
  return {
    person,score,positionMatch,skillMatch,planningStart,firstAvailableDate,
    workingDays:working.length,
    averageAvailable:working.length?Math.round(working.reduce((sum,day)=>sum+day.available,0)/working.length):0,
    minAvailable:working.length?Math.min(...working.map(day=>day.available)):0,
    overloadDays:scenario.overloadDays.length,feasible:scenario.feasible,reasons,risks,scenario
  };
}

export function recommendAssignmentCandidates(db,proposal,{startDate=localDateKey(new Date()),days=30,consecutiveDays=1,limit=10}={}){
  const candidates=(db.people||[]).map(person=>scoreAssignmentCandidate(db,person,proposal,{startDate,days,consecutiveDays})).filter(Boolean);
  candidates.sort((a,b)=>b.score-a.score||Number(b.positionMatch)-Number(a.positionMatch)||Number(b.skillMatch)-Number(a.skillMatch)||b.averageAvailable-a.averageAvailable||String(a.person.name||'').localeCompare(String(b.person.name||''),'zh-CN'));
  return candidates.slice(0,Math.max(1,Number(limit||10))).map((item,index)=>({...item,rank:index+1}));
}

export function recommendForStaffingNeed(db,needId,{startDate=localDateKey(new Date()),days=30,consecutiveDays=1,limit=10}={}){
  const need=(db.staffingNeeds||[]).find(item=>item.id===needId);
  if(!need)return {ok:false,error:'用人需求不存在',candidates:[]};
  const project=(db.projects||[]).find(item=>item.id===need.projectId);
  if(!project||!projectRequiresStaffing(project))return {ok:false,error:'项目当前无需人员安排',candidates:[]};
  const gap=Math.max(0,Number(need.requiredCapacity||0)-needAllocated(db,need));
  if(gap<=0)return {ok:true,need,project,gap:0,candidates:[]};
  const proposal={
    projectId:project.id,role:need.role,stage:need.stage||'其它',allocation:Math.min(100,gap),
    startDate:need.neededBy||startDate,endDate:project.ddl||''
  };
  return {ok:true,need,project,gap,candidates:recommendAssignmentCandidates(db,proposal,{startDate:proposal.startDate,days,consecutiveDays,limit})};
}
