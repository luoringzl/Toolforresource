import { cloneDatabase } from '../schema/database.mjs';
import { optimizeSchedule } from './schedule-optimizer.mjs';
import { buildDependencyAwareStaffingPlan } from './dependency-aware-scheduling.mjs';
import { localDateKey } from '../utils/date.mjs';

function maxDate(...values){return values.filter(Boolean).sort().at(-1)||'';}

function emptyOptimization(objective='balanced'){
  return {objective,objectiveLabel:'依赖门控后暂无可优化需求',options:[],recommended:null,generatedAt:new Date().toISOString()};
}

export function optimizeDependencyAwareSchedule(db,{
  objective='balanced',startDate=localDateKey(new Date()),...options
}={}){
  const plan=buildDependencyAwareStaffingPlan(db,{startDate,...options});
  if(!plan.ok)return {ok:false,error:plan.error,plan,optimization:emptyOptimization(objective)};
  if(!plan.eligibleNeeds.length)return {ok:true,plan,optimization:emptyOptimization(objective)};

  const simulated=cloneDatabase(db);
  for(const item of plan.eligibleNeeds){
    const need=simulated.staffingNeeds.find(candidate=>candidate.id===item.need.id);
    if(need)need.neededBy=maxDate(need.neededBy,startDate,item.earliestStaffingDate);
  }
  const optimization=optimizeSchedule(simulated,{
    ...options,objective,startDate,needIds:plan.eligibleNeeds.map(item=>item.need.id)
  });
  return {ok:true,plan,optimization};
}
