import { planningSettingsFromDatabase } from '../schema/migrations.mjs';
import { localDateKey } from '../utils/date.mjs';
import { buildPlanningDashboardModel } from './planning-dashboard.mjs';
import { generateAutoScheduleDraft } from './auto-scheduler.mjs';
import { recommendForStaffingNeed } from './recommendation-engine.mjs';
import { buildProjectGanttModel, buildResourceGanttModel, ganttViewport } from './gantt-model.mjs';

function positive(value,fallback){
  const number=Number(value);
  return Number.isFinite(number)&&number>0?number:fallback;
}

export function resolvePlanningRuntimeConfig(db,overrides={}){
  const stored=planningSettingsFromDatabase(db);
  const horizons=(overrides.horizons||overrides.forecastHorizons||stored.forecastHorizons)
    .map(Number).filter(day=>day>0);
  return {
    startDate:overrides.startDate||localDateKey(new Date()),
    horizons:[...new Set(horizons)].sort((a,b)=>a-b),
    forecastDays:positive(overrides.forecastDays,stored.defaultForecastDays),
    ganttDays:positive(overrides.ganttDays,stored.defaultGanttDays),
    ganttViewportDays:positive(overrides.ganttViewportDays,stored.defaultGanttViewportDays),
    recommendationDays:positive(overrides.recommendationDays,stored.recommendationDays),
    autoScheduleDays:positive(overrides.autoScheduleDays??overrides.days,stored.autoScheduleDays),
    maxPeoplePerNeed:positive(overrides.maxPeoplePerNeed,stored.maxPeoplePerNeed),
    maxChunk:Math.min(100,positive(overrides.maxChunk,stored.maxAllocationChunk)),
    minChunk:Math.min(100,positive(overrides.minChunk,stored.minAllocationChunk)),
    step:positive(overrides.step,stored.allocationStep),
    workingDays:[...(overrides.workingDays||stored.workingDays)],
    nonWorkingDates:[...(overrides.nonWorkingDates||stored.nonWorkingDates||[])],
    workingDateOverrides:[...(overrides.workingDateOverrides||stored.workingDateOverrides||[])],
    capacityUnit:overrides.capacityUnit||stored.capacityUnit,
    recommendationLimit:positive(overrides.recommendationLimit,3),
    consecutiveDays:positive(overrides.consecutiveDays,1)
  };
}

export function buildConfiguredPlanningDashboard(db,overrides={}){
  const config=resolvePlanningRuntimeConfig(db,overrides);
  return buildPlanningDashboardModel(db,{
    startDate:config.startDate,
    horizons:config.horizons,
    ganttDays:config.ganttDays,
    ganttViewportDays:config.ganttViewportDays,
    recommendationDays:config.recommendationDays,
    recommendationLimit:config.recommendationLimit
  });
}

export function generateConfiguredAutoScheduleDraft(db,overrides={}){
  const config=resolvePlanningRuntimeConfig(db,overrides);
  return generateAutoScheduleDraft(db,{
    ...overrides,
    startDate:config.startDate,
    days:config.autoScheduleDays,
    maxPeoplePerNeed:config.maxPeoplePerNeed,
    maxChunk:config.maxChunk,
    minChunk:Math.min(config.minChunk,config.maxChunk),
    step:config.step,
    consecutiveDays:config.consecutiveDays
  });
}

export function recommendConfiguredForNeed(db,needId,overrides={}){
  const config=resolvePlanningRuntimeConfig(db,overrides);
  return recommendForStaffingNeed(db,needId,{
    startDate:config.startDate,
    days:config.recommendationDays,
    consecutiveDays:config.consecutiveDays,
    limit:positive(overrides.limit,config.recommendationLimit)
  });
}

export function buildConfiguredGantt(db,{kind='resource',offset=0,...overrides}={}){
  const config=resolvePlanningRuntimeConfig(db,overrides);
  const model=kind==='project'
    ? buildProjectGanttModel(db,{startDate:config.startDate,days:config.ganttDays})
    : buildResourceGanttModel(db,{startDate:config.startDate,days:config.ganttDays});
  return {
    config,
    model,
    viewport:ganttViewport(model,{offset,length:config.ganttViewportDays})
  };
}
