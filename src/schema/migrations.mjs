export const CURRENT_DATABASE_VERSION=7;

export const DEFAULT_PLANNING_SETTINGS=Object.freeze({
  forecastHorizons:[30,60,90],
  defaultForecastDays:30,
  defaultGanttDays:60,
  defaultGanttViewportDays:21,
  recommendationDays:30,
  autoScheduleDays:60,
  maxPeoplePerNeed:4,
  maxAllocationChunk:50,
  minAllocationChunk:10,
  allocationStep:10,
  workingDays:[1,2,3,4,5],
  capacityUnit:'percent'
});

function normalizePlanningSettings(value={}){
  const planning={...DEFAULT_PLANNING_SETTINGS,...(value||{})};
  planning.forecastHorizons=[...new Set((planning.forecastHorizons||DEFAULT_PLANNING_SETTINGS.forecastHorizons).map(Number).filter(day=>day>0))].sort((a,b)=>a-b);
  planning.workingDays=[...new Set((planning.workingDays||DEFAULT_PLANNING_SETTINGS.workingDays).map(Number).filter(day=>day>=0&&day<=6))].sort((a,b)=>a-b);
  planning.defaultForecastDays=Math.max(1,Number(planning.defaultForecastDays||30));
  planning.defaultGanttDays=Math.max(1,Number(planning.defaultGanttDays||60));
  planning.defaultGanttViewportDays=Math.max(1,Number(planning.defaultGanttViewportDays||21));
  planning.recommendationDays=Math.max(1,Number(planning.recommendationDays||30));
  planning.autoScheduleDays=Math.max(1,Number(planning.autoScheduleDays||60));
  planning.maxPeoplePerNeed=Math.max(1,Number(planning.maxPeoplePerNeed||4));
  planning.maxAllocationChunk=Math.min(100,Math.max(1,Number(planning.maxAllocationChunk||50)));
  planning.minAllocationChunk=Math.min(planning.maxAllocationChunk,Math.max(1,Number(planning.minAllocationChunk||10)));
  planning.allocationStep=Math.max(1,Number(planning.allocationStep||10));
  planning.capacityUnit=planning.capacityUnit||'percent';
  return planning;
}

function migrationMeta(data={},migration=''){
  const previous=data.meta&&typeof data.meta==='object'?data.meta:{};
  const migrations=[...new Set([...(previous.migrations||[]),...(migration?[migration]:[])])];
  return {...previous,schemaVersion:CURRENT_DATABASE_VERSION,migrations};
}

export function migrateV6ToV7(data={}){
  const settings=data.settings&&typeof data.settings==='object'?data.settings:{};
  return {
    ...data,
    version:7,
    meta:migrationMeta(data,'6->7'),
    settings:{
      ...settings,
      planning:normalizePlanningSettings(settings.planning)
    }
  };
}

export function migrateToCurrentVersion(data={}){
  const source=data&&typeof data==='object'&&!Array.isArray(data)?data:{};
  const version=Number(source.version||6);
  if(version> CURRENT_DATABASE_VERSION)throw new Error(`数据库版本 ${version} 高于当前支持版本 ${CURRENT_DATABASE_VERSION}`);
  let current={...source};
  if(version<=6)current=migrateV6ToV7(current);
  else current={
    ...current,
    version:CURRENT_DATABASE_VERSION,
    meta:migrationMeta(current),
    settings:{...(current.settings||{}),planning:normalizePlanningSettings(current.settings?.planning)}
  };
  return current;
}

export function planningSettingsFromDatabase(db={}){
  return normalizePlanningSettings(db.settings?.planning);
}
