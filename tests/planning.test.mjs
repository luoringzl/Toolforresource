import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDatabase } from '../src/core.mjs';
import {
  buildCapacityCalendar, buildPersonCapacitySeries, capacityConflicts,
  dailyTeamCapacity, firstDateWithCapacity, internalAssignmentActiveOnDate
} from '../src/planning/capacity-calendar.mjs';
import { forecastPersonCapacity, forecastTeamCapacity, rankFutureCapacityCandidates } from '../src/planning/capacity-forecast.mjs';
import { compareAssignmentCandidates, scenarioConflictSummary, simulateAssignmentScenario } from '../src/planning/scenario-planner.mjs';

function fixture(){
  const db=emptyDatabase();
  db.projects.push({id:'p1',name:'影片A',status:'制作中',startDate:'2026-08-01',ddl:'2026-08-20'});
  db.people.push(
    {id:'u1',name:'甲',capacity:100,employmentStatus:'在岗',positions:['AI动画师']},
    {id:'u2',name:'乙',capacity:100,employmentStatus:'在岗',positions:['AI动画师']}
  );
  db.assignments.push({id:'a1',projectId:'p1',personId:'u1',role:'视频制作人员',stage:'视频',allocation:60,status:'进行中',startDate:'2026-08-10',endDate:'2026-08-15'});
  db.people[0].externalAssignments=[{id:'e1',name:'培训',allocation:30,status:'进行中',startDate:'2026-08-12',endDate:'2026-08-18'}];
  return db;
}

test('按日期计算内部与外部项目产能占用',()=>{
  const db=fixture();
  const series=buildPersonCapacitySeries(db,db.people[0],{startDate:'2026-08-11',days:8});
  assert.equal(series[0].date,'2026-08-11');
  assert.equal(series[0].usage,60);
  assert.equal(series[1].usage,90);
  assert.equal(series[5].date,'2026-08-16');
  assert.equal(series[5].usage,30);
  assert.equal(series[7].usage,30);
});

test('资产岗位以资产完成日期提前结束规划占用',()=>{
  const db=fixture();
  db.projects[0].assetCompletionDate='2026-08-13';
  const assignment={id:'asset',projectId:'p1',personId:'u2',role:'资产制作人员',stage:'资产',allocation:50,status:'进行中',startDate:'2026-08-10'};
  assert.equal(internalAssignmentActiveOnDate(db,assignment,'2026-08-13'),true);
  assert.equal(internalAssignmentActiveOnDate(db,assignment,'2026-08-14'),false);
});

test('产能日历识别日期级超载冲突',()=>{
  const db=fixture();
  db.assignments.push({id:'a2',projectId:'p1',personId:'u1',role:'其它支持',allocation:30,status:'进行中',startDate:'2026-08-12',endDate:'2026-08-14'});
  const calendar=buildCapacityCalendar(db,{startDate:'2026-08-12',days:3});
  const conflicts=capacityConflicts(calendar);
  assert.equal(conflicts.length,3);
  assert.ok(conflicts.every(item=>item.person.id==='u1'&&item.usage===120));
});

test('查找满足连续工作日需求的首个可用日期',()=>{
  const db=fixture();
  const series=buildPersonCapacitySeries(db,db.people[0],{startDate:'2026-08-12',days:12});
  assert.equal(firstDateWithCapacity(series,80,{consecutiveDays:2}),'2026-08-19');
  assert.equal(firstDateWithCapacity(series,100,{consecutiveDays:2}),'2026-08-19');
});

test('30/60/90 天个人预测输出窗口指标',()=>{
  const db=fixture();
  const forecast=forecastPersonCapacity(db,'u1',{startDate:'2026-08-01',horizons:[30,60,90],requiredCapacity:80,consecutiveDays:2});
  assert.equal(forecast.windows[30].days,30);
  assert.equal(forecast.windows[60].days,60);
  assert.equal(forecast.windows[90].days,90);
  assert.equal(forecast.windows[30].firstDateWithCapacity,'2026-08-01');
  assert.ok(forecast.windows[30].minAvailable<=40);
});

test('团队预测汇总利用率、峰值和冲突天数',()=>{
  const db=fixture();
  db.assignments.push({id:'a2',projectId:'p1',personId:'u1',role:'其它支持',allocation:50,status:'进行中',startDate:'2026-08-12',endDate:'2026-08-14'});
  const forecast=forecastTeamCapacity(db,{startDate:'2026-08-12',horizons:[30]});
  assert.ok(forecast.windows[30].utilization>0);
  assert.ok(forecast.windows[30].peakUsage>=140);
  assert.equal(forecast.windows[30].overloadedDays,3);
  assert.equal(forecast.conflicts.length,3);
  const team=dailyTeamCapacity(db,{startDate:'2026-08-12',days:1})[0];
  assert.equal(team.capacity,200);
});

test('情景模拟在真正写入前判断新分配是否导致超载',()=>{
  const db=fixture();
  const scenario=simulateAssignmentScenario(db,{personId:'u1',projectId:'p1',role:'其它支持',allocation:50,startDate:'2026-08-12',endDate:'2026-08-14'},{startDate:'2026-08-12',days:7});
  assert.equal(scenario.ok,true);
  assert.equal(scenario.feasible,false);
  assert.equal(scenario.overloadDays.length,3);
  assert.ok(scenario.maxUsage>=140);
});

test('候选比较优先推荐不会造成时间冲突的人',()=>{
  const db=fixture();
  const ranked=compareAssignmentCandidates(db,{projectId:'p1',role:'视频制作人员',allocation:50,startDate:'2026-08-12',endDate:'2026-08-14'},{candidateIds:['u1','u2'],startDate:'2026-08-12',days:7});
  assert.equal(ranked[0].person.id,'u2');
  assert.equal(ranked[0].feasible,true);
  assert.equal(ranked[1].person.id,'u1');
  assert.equal(ranked[1].feasible,false);
});

test('多项假设分配可一次输出整体资源冲突摘要',()=>{
  const db=fixture();
  const summary=scenarioConflictSummary(db,[
    {personId:'u1',projectId:'p1',role:'支持A',allocation:30,startDate:'2026-08-12',endDate:'2026-08-13'},
    {personId:'u1',projectId:'p1',role:'支持B',allocation:20,startDate:'2026-08-12',endDate:'2026-08-13'}
  ],{startDate:'2026-08-12',days:3});
  assert.equal(summary.feasible,false);
  assert.equal(summary.conflicts.length,2);
});

test('未来候选排名同时考虑最早可用日期和平均剩余产能',()=>{
  const db=fixture();
  const ranked=rankFutureCapacityCandidates(db,{startDate:'2026-08-12',days:10,requiredCapacity:80,consecutiveDays:2});
  assert.equal(ranked[0].person.id,'u2');
  assert.equal(ranked[0].firstAvailableDate,'2026-08-12');
  assert.equal(ranked[1].person.id,'u1');
});
