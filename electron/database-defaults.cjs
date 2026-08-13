const DB_VERSION = 7;

const DEFAULT_PLANNING_SETTINGS = Object.freeze({
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
  nonWorkingDates:[],
  workingDateOverrides:[],
  capacityUnit:'percent'
});

function emptyDatabase() {
  return {
    version: DB_VERSION,
    meta: { schemaVersion:DB_VERSION, migrations:[] },
    updatedAt: new Date().toISOString(),
    projects: [], people: [], assignments: [], staffingNeeds: [], activity: [],
    settings: {
      companyName:'', warningDays:7, dictionaries:{}, customFields:{projects:[],people:[]},
      planning:{
        ...DEFAULT_PLANNING_SETTINGS,
        forecastHorizons:[...DEFAULT_PLANNING_SETTINGS.forecastHorizons],
        workingDays:[...DEFAULT_PLANNING_SETTINGS.workingDays],
        nonWorkingDates:[],workingDateOverrides:[]
      }
    }
  };
}

module.exports={DB_VERSION,DEFAULT_PLANNING_SETTINGS,emptyDatabase};
