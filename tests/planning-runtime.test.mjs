import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDatabase } from '../src/core.mjs';
import { buildConfiguredGantt, buildConfiguredPlanningDashboard, generateConfiguredAutoScheduleDraft, recommendConfiguredForNeed, resolvePlanningRuntimeConfig } from '../src/planning/planning-runtime.mjs';
import { resetPlanningSettings, updatePlanningSettings, validatePlanningSettings } from '../src/services/planning-settings.mjs';

function fixture(){
  const db=emptyDatabase();
  db.projects.push({id:'p1',name:'项目A',status:'视频制作中',startDate:'2026-08-12',ddl:'2026-09-30'});
  db.people.push(
    {id:'u1',name:'动画甲',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'高级'}]},
    {id:'u2',name:'动画乙',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'中级'}]}
  );
  db.staffingNeeds.push({id:'n1',projectId:'p1',role:'视频制作人员',stage:'视频',requiredCapacity:60,neededBy:'2026-08-12',status:'待安排'});
  return db;
}

test('Planning Runtime 默认读取 V7 settings',()=>{
  const db=fixture();
  db.settings.planning.forecastHorizons=[14,45];
  db.settings.planning.defaultGanttDays=75;
  db.settings.planning.defaultGanttViewportDays=18;
  db.settings.planning.recommendationDays=21;
  db.settings.planning.autoScheduleDays=50;
  db.settings.planning.maxPeoplePerNeed=2;
  db.settings.planning.maxAllocationChunk=35;
  db.settings.planning.minAllocationChunk=15;
  db.settings.planning.allocationStep=5;
  const config=resolvePlanningRuntimeConfig(db,{startDate:'2026-08-12'});
  assert.deepEqual(config.horizons,[14,45]);
  assert.equal(config.ganttDays,75);
  assert.equal(config.ganttViewportDays,18);
  assert.equal(config.recommendationDays,21);
  assert.equal(config.autoScheduleDays,50);
  assert.equal(config.maxPeoplePerNeed,2);
  assert.equal(config.maxChunk,35);
  assert.equal(config.minChunk,15);
  assert.equal(config.step,5);
});

test('显式运行参数可覆盖数据库 planning settings',()=>{
  const db=fixture();
  db.settings.planning.defaultGanttDays=90;
  const config=resolvePlanningRuntimeConfig(db,{startDate:'2026-08-12',ganttDays:30,horizons:[7,14],maxChunk:25});
  assert.equal(config.ganttDays,30);
  assert.deepEqual(config.horizons,[7,14]);
  assert.equal(config.maxChunk,25);
});

test('Configured Planning Dashboard 使用配置预测周期与甘特窗口',()=>{
  const db=fixture();
  db.settings.planning.forecastHorizons=[10,20];
  db.settings.planning.defaultGanttDays=40;
  db.settings.planning.defaultGanttViewportDays=12;
  const model=buildConfiguredPlanningDashboard(db,{startDate:'2026-08-12'});
  assert.deepEqual(model.horizons,[10,20]);
  assert.equal(model.horizonCards.length,2);
  assert.equal(model.heatmap.length,20);
  assert.equal(model.resourceGantt.columns.length,40);
  assert.equal(model.resourceGanttViewport.columns.length,12);
});

test('Configured Gantt 的窗口大小由 V7 setting 驱动',()=>{
  const db=fixture();
  db.settings.planning.defaultGanttDays=33;
  db.settings.planning.defaultGanttViewportDays=9;
  const result=buildConfiguredGantt(db,{startDate:'2026-08-12'});
  assert.equal(result.model.columns.length,33);
  assert.equal(result.viewport.columns.length,9);
});

test('Configured Need Recommendation 使用 recommendationDays',()=>{
  const db=fixture();
  db.settings.planning.recommendationDays=17;
  const result=recommendConfiguredForNeed(db,'n1',{startDate:'2026-08-12'});
  assert.equal(result.ok,true);
  assert.ok(result.candidates.length>0);
  assert.equal(result.candidates[0].scenario.after.length,17);
});

test('Configured Auto Schedule 使用 chunk 与最大人数配置',()=>{
  const db=fixture();
  db.staffingNeeds[0].requiredCapacity=80;
  db.settings.planning.maxAllocationChunk=30;
  db.settings.planning.minAllocationChunk=10;
  db.settings.planning.allocationStep=10;
  db.settings.planning.maxPeoplePerNeed=2;
  db.settings.planning.autoScheduleDays=45;
  const draft=generateConfiguredAutoScheduleDraft(db,{needIds:['n1'],startDate:'2026-08-12'});
  assert.equal(draft.days,45);
  assert.equal(draft.proposals.length,2);
  assert.equal(draft.summary.allocatedCapacity,60);
  assert.equal(draft.unresolved[0].remaining,20);
});

test('Planning Settings Service 拒绝无效配置且不修改原数据库',()=>{
  const db=fixture();
  const before=structuredClone(db.settings.planning);
  const result=updatePlanningSettings(db,{maxAllocationChunk:20,minAllocationChunk:30});
  assert.equal(result.ok,false);
  assert.deepEqual(db.settings.planning,before);
  assert.match(result.error,/最小单人分配不能大于最大单人分配/);
});

test('Planning Settings Service 正确写入规范化值',()=>{
  const db=fixture();
  const result=updatePlanningSettings(db,{
    forecastHorizons:[90,15,30,15],workingDays:[5,1,3,1],
    defaultForecastDays:45,defaultGanttDays:90,defaultGanttViewportDays:21,
    recommendationDays:40,autoScheduleDays:75,maxPeoplePerNeed:6,
    maxAllocationChunk:60,minAllocationChunk:15,allocationStep:5
  });
  assert.equal(result.ok,true);
  assert.deepEqual(result.settings.forecastHorizons,[15,30,90]);
  assert.deepEqual(result.settings.workingDays,[1,3,5]);
  assert.equal(result.settings.maxPeoplePerNeed,6);
  assert.equal(db.settings.planning.maxPeoplePerNeed,4);
});

test('Planning Settings validation 覆盖关键边界',()=>{
  const invalid=validatePlanningSettings({
    forecastHorizons:[],workingDays:[],defaultForecastDays:0,defaultGanttDays:10,defaultGanttViewportDays:20,
    recommendationDays:0,autoScheduleDays:0,maxPeoplePerNeed:0,maxAllocationChunk:101,minAllocationChunk:0,allocationStep:0
  });
  assert.equal(invalid.ok,false);
  assert.ok(invalid.errors.length>=6);
});

test('Planning Settings 可恢复默认值',()=>{
  const db=fixture();
  db.settings.planning.maxPeoplePerNeed=9;
  db.settings.planning.forecastHorizons=[5];
  const result=resetPlanningSettings(db);
  assert.equal(result.ok,true);
  assert.equal(result.settings.maxPeoplePerNeed,4);
  assert.deepEqual(result.settings.forecastHorizons,[30,60,90]);
});
