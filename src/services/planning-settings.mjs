import { cloneDatabase } from '../schema/database.mjs';
import { DEFAULT_PLANNING_SETTINGS, planningSettingsFromDatabase } from '../schema/migrations.mjs';

function normalizedList(value,{min,max}={}){
  return [...new Set((Array.isArray(value)?value:[]).map(Number).filter(item=>Number.isFinite(item)&&(min===undefined||item>=min)&&(max===undefined||item<=max)))].sort((a,b)=>a-b);
}

export function validatePlanningSettings(values={}){
  const errors=[];
  const horizons=normalizedList(values.forecastHorizons,{min:1});
  if(!horizons.length)errors.push('至少需要一个预测周期');
  const workingDays=normalizedList(values.workingDays,{min:0,max:6});
  if(!workingDays.length)errors.push('至少需要一个工作日');
  const maxPeople=Number(values.maxPeoplePerNeed);
  if(!Number.isFinite(maxPeople)||maxPeople<1||maxPeople>20)errors.push('单需求最大建议人数需在 1-20 之间');
  const maxChunk=Number(values.maxAllocationChunk);
  const minChunk=Number(values.minAllocationChunk);
  if(!Number.isFinite(maxChunk)||maxChunk<1||maxChunk>100)errors.push('最大单人分配需在 1-100% 之间');
  if(!Number.isFinite(minChunk)||minChunk<1||minChunk>100)errors.push('最小单人分配需在 1-100% 之间');
  if(Number.isFinite(maxChunk)&&Number.isFinite(minChunk)&&minChunk>maxChunk)errors.push('最小单人分配不能大于最大单人分配');
  const step=Number(values.allocationStep);
  if(!Number.isFinite(step)||step<1||step>100)errors.push('分配步长需在 1-100 之间');
  for(const key of ['defaultForecastDays','defaultGanttDays','defaultGanttViewportDays','recommendationDays','autoScheduleDays']){
    const value=Number(values[key]);
    if(!Number.isFinite(value)||value<1||value>3650)errors.push(`${key} 需在 1-3650 天之间`);
  }
  if(Number(values.defaultGanttViewportDays)>Number(values.defaultGanttDays))errors.push('甘特可视窗口不能大于甘特总窗口');
  return {ok:errors.length===0,errors};
}

export function updatePlanningSettings(database,patch={}){
  const db=cloneDatabase(database);
  const current=planningSettingsFromDatabase(db);
  const next={...current,...patch};
  const validation=validatePlanningSettings(next);
  if(!validation.ok)return {ok:false,error:validation.errors.join('；'),errors:validation.errors,database};
  db.settings=db.settings||{};
  db.settings.planning={
    ...next,
    forecastHorizons:normalizedList(next.forecastHorizons,{min:1}),
    workingDays:normalizedList(next.workingDays,{min:0,max:6}),
    defaultForecastDays:Number(next.defaultForecastDays),
    defaultGanttDays:Number(next.defaultGanttDays),
    defaultGanttViewportDays:Number(next.defaultGanttViewportDays),
    recommendationDays:Number(next.recommendationDays),
    autoScheduleDays:Number(next.autoScheduleDays),
    maxPeoplePerNeed:Number(next.maxPeoplePerNeed),
    maxAllocationChunk:Number(next.maxAllocationChunk),
    minAllocationChunk:Number(next.minAllocationChunk),
    allocationStep:Number(next.allocationStep),
    capacityUnit:next.capacityUnit||DEFAULT_PLANNING_SETTINGS.capacityUnit
  };
  return {ok:true,database:db,settings:db.settings.planning};
}

export function resetPlanningSettings(database){
  return updatePlanningSettings(database,{
    ...DEFAULT_PLANNING_SETTINGS,
    forecastHorizons:[...DEFAULT_PLANNING_SETTINGS.forecastHorizons],
    workingDays:[...DEFAULT_PLANNING_SETTINGS.workingDays]
  });
}
