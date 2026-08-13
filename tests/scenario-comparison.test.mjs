import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDatabase } from '../src/core.mjs';
import {
  applyScenarioCommands,
  comparePlanningScenarios,
  diffScenarioEntities,
  planningScenarioMetrics,
  scenarioCommands,
  scenarioMetricDelta,
  scoreScenarioMetrics
} from '../src/planning/scenario-comparison.mjs';

function fixture(){
  const db=emptyDatabase();
  db.projects.push(
    {id:'p1',name:'主项目',status:'制作中',priority:'P0 紧急',startDate:'2026-08-17',ddl:'2026-09-20'},
    {id:'p2',name:'支援项目',status:'制作中',priority:'P2 中',startDate:'2026-08-17',ddl:'2026-09-10'}
  );
  db.people.push(
    {id:'u1',name:'甲',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'高级'}]},
    {id:'u2',name:'乙',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'高级'}]},
    {id:'u3',name:'丙',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'中级'}]}
  );
  db.assignments.push(
    {id:'a1',projectId:'p1',personId:'u1',role:'其它支持',stage:'其它',allocation:80,status:'进行中',startDate:'2026-08-17',endDate:'2026-09-20'},
    {id:'a2',projectId:'p2',personId:'u1',role:'其它支持',stage:'其它',allocation:40,status:'进行中',startDate:'2026-08-17',endDate:'2026-09-10'}
  );
  db.staffingNeeds.push({id:'n1',projectId:'p1',role:'视频制作人员',stage:'视频',requiredCapacity:50,neededBy:'2026-08-17',status:'待安排'});
  return db;
}

function transferScenario(){
  return {
    id:'transfer',label:'把支援项目转给乙',
    commands:[
      {type:'assignment.remove',payload:{id:'a2'}},
      {type:'assignment.assign',payload:{projectId:'p2',personId:'u2',role:'其它支持',stage:'其它',allocation:40,startDate:'2026-08-17',endDate:'2026-09-10'}}
    ]
  };
}

function fillNeedScenario(){
  return {
    id:'fill',label:'用乙补齐视频需求',
    commands:[
      {type:'assignment.assign',payload:{needId:'n1',projectId:'p1',personId:'u2',role:'视频制作人员',stage:'视频',allocation:50,startDate:'2026-08-17',endDate:'2026-09-20'}}
    ]
  };
}

test('applyScenarioCommands 顺序执行标准命令但不修改原数据库',()=>{
  const db=fixture();
  const result=applyScenarioCommands(db,transferScenario().commands,{now:new Date('2026-08-17T09:00:00+08:00')});
  assert.equal(result.ok,true);
  assert.equal(db.assignments.find(item=>item.id==='a2').personId,'u1');
  assert.equal(result.database.assignments.some(item=>item.id==='a2'),false);
  assert.ok(result.database.assignments.some(item=>item.projectId==='p2'&&item.personId==='u2'));
});

test('调走叠加任务的情景能消除人员冲突',()=>{
  const db=fixture();
  const comparison=comparePlanningScenarios(db,[transferScenario()],{startDate:'2026-08-17',horizons:[30],ganttDays:30,ganttViewportDays:14});
  assert.equal(comparison.baseline.metrics.conflictPeople,1);
  const option=comparison.options[0];
  assert.equal(option.ok,true);
  assert.equal(option.metrics.conflictPeople,0);
  assert.equal(option.delta.conflictPeople,-1);
  assert.equal(option.delta.conflictDays,-19);
  assert.equal(option.betterThanBaseline,true);
  assert.match(option.explanations.join('；'),/减少 1 名冲突人员/);
});

test('补齐 Staffing Need 的情景减少待安排需求和未解决产能',()=>{
  const comparison=comparePlanningScenarios(fixture(),[fillNeedScenario()],{startDate:'2026-08-17',objective:'staffing',horizons:[30]});
  const option=comparison.options[0];
  assert.equal(comparison.baseline.metrics.openNeeds,1);
  assert.equal(comparison.baseline.metrics.unresolvedCapacity,50);
  assert.equal(option.metrics.openNeeds,0);
  assert.equal(option.metrics.unresolvedCapacity,0);
  assert.equal(option.delta.openNeeds,-1);
  assert.equal(option.delta.unresolvedCapacity,-50);
  assert.match(option.explanations.join('；'),/减少 1 条待安排需求/);
});

test('人员请假情景会把已有占用暴露为更严重的产能风险',()=>{
  const db=fixture();
  const scenario={
    id:'leave',label:'甲请假',
    commands:[{type:'person.upsert',payload:{id:'u1',values:{name:'甲',capacity:100,employmentStatus:'请假',position:'AI动画师',positions:['AI动画师']}}}]
  };
  const comparison=comparePlanningScenarios(db,[scenario],{startDate:'2026-08-17',horizons:[30]});
  const option=comparison.options[0];
  assert.equal(option.ok,true);
  assert.ok(option.metrics.conflictEvents>=comparison.baseline.metrics.conflictEvents);
  assert.ok(option.metrics.primaryAverageAvailable<comparison.baseline.metrics.primaryAverageAvailable);
  assert.equal(option.impact.changedPeople.length,1);
  assert.equal(option.impact.changedPeople[0].afterStatus,'请假');
  assert.equal(option.betterThanBaseline,false);
});

test('多个情景按同一目标函数排名并返回推荐项',()=>{
  const comparison=comparePlanningScenarios(fixture(),[
    {id:'noop',label:'无变化',commands:[]},
    transferScenario(),
    fillNeedScenario()
  ],{startDate:'2026-08-17',objective:'balanced',horizons:[30]});
  assert.equal(comparison.options.length,3);
  assert.ok(comparison.recommended);
  assert.equal(comparison.options[0].rank,1);
  assert.ok(comparison.recommended.scenarioScore>=comparison.options.filter(item=>item.ok).at(-1).scenarioScore);
  assert.ok(['transfer','fill'].includes(comparison.recommended.id));
});

test('非法情景保留错误信息且不阻断其它有效情景',()=>{
  const comparison=comparePlanningScenarios(fixture(),[
    {id:'bad',label:'错误人员',commands:[{type:'assignment.assign',payload:{projectId:'p1',personId:'missing',role:'视频制作人员',allocation:50}}]},
    transferScenario()
  ],{startDate:'2026-08-17',horizons:[14]});
  const bad=comparison.options.find(item=>item.id==='bad');
  const good=comparison.options.find(item=>item.id==='transfer');
  assert.equal(bad.ok,false);
  assert.equal(bad.code,'PERSON_NOT_FOUND');
  assert.equal(bad.failedIndex,0);
  assert.equal(good.ok,true);
  assert.equal(comparison.recommended.id,'transfer');
});

test('diffScenarioEntities 能识别新增、移除和人员状态变化',()=>{
  const db=fixture();
  const applied=applyScenarioCommands(db,[
    ...transferScenario().commands,
    {type:'person.upsert',payload:{id:'u3',values:{name:'丙',capacity:80,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师']}}}
  ]);
  const diff=diffScenarioEntities(db,applied.database);
  assert.equal(diff.removedAssignments.length,1);
  assert.equal(diff.addedAssignments.length,1);
  assert.equal(diff.changedPeople.length,1);
  assert.equal(diff.changedPeople[0].beforeCapacity,100);
  assert.equal(diff.changedPeople[0].afterCapacity,80);
});

test('指标评分与 delta 提供稳定的纯函数比较边界',()=>{
  const before={openNeeds:2,unresolvedCapacity:80,conflictPeople:2,conflictDays:5,conflictEvents:8,primaryAverageAvailable:40,primaryPeakUsage:180,horizons:{30:{utilization:80,averageAvailable:40,peakUsage:180,overloadedDays:5}}};
  const after={openNeeds:1,unresolvedCapacity:30,conflictPeople:1,conflictDays:2,conflictEvents:3,primaryAverageAvailable:55,primaryPeakUsage:120,horizons:{30:{utilization:72,averageAvailable:55,peakUsage:120,overloadedDays:2}}};
  const delta=scenarioMetricDelta(before,after);
  assert.equal(delta.openNeeds,-1);
  assert.equal(delta.horizons[30].overloadedDays,-3);
  assert.ok(scoreScenarioMetrics(after,{objective:'balanced'}).score>scoreScenarioMetrics(before,{objective:'balanced'}).score);
});

test('planningScenarioMetrics 从 Planning Dashboard model 汇总比较指标',()=>{
  const metrics=planningScenarioMetrics({
    summary:{activeProjects:2,openNeeds:1,conflictPeople:1,conflictDays:3},
    openNeeds:[{gap:40}],conflicts:[{},{},{}],conflictPeople:[{severity:'critical'}],
    horizonCards:[{days:30,workingDays:22,utilization:75,averageAvailable:90,peakUsage:160,overloadedDays:3}]
  });
  assert.equal(metrics.unresolvedCapacity,40);
  assert.equal(metrics.conflictEvents,3);
  assert.equal(metrics.criticalConflictPeople,1);
  assert.equal(metrics.primaryUtilization,75);
});

test('推荐情景的 commands 可原样交给 Application Service 批量应用',()=>{
  const comparison=comparePlanningScenarios(fixture(),[transferScenario()],{startDate:'2026-08-17',horizons:[14]});
  assert.deepEqual(scenarioCommands(comparison.recommended),transferScenario().commands);
});
