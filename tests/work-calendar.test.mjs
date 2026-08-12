import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDatabase } from '../src/core.mjs';
import { buildPersonCapacitySeries, firstDateWithCapacity } from '../src/planning/capacity-calendar.mjs';
import { forecastPersonCapacity, forecastTeamCapacity } from '../src/planning/capacity-forecast.mjs';
import { buildPlanningDashboardModel } from '../src/planning/planning-dashboard.mjs';
import { generateConfiguredAutoScheduleDraft, resolvePlanningRuntimeConfig } from '../src/planning/planning-runtime.mjs';
import { updatePlanningSettings } from '../src/services/planning-settings.mjs';
import { addWorkingDaysKey, countWorkingDates, createWorkCalendar, isWorkingDate, nextWorkingDate, workDateStatus } from '../src/planning/work-calendar.mjs';

function fixture(){
  const db=emptyDatabase();
  db.projects.push({id:'p1',name:'工作日项目',status:'制作中',startDate:'2026-08-14',ddl:'2026-08-31'});
  db.people.push({id:'u1',name:'动画甲',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'高级'}]});
  db.assignments.push({id:'a1',projectId:'p1',personId:'u1',role:'其它支持',stage:'其它',allocation:60,status:'进行中',startDate:'2026-08-14',endDate:'2026-08-20'});
  return db;
}

test('默认工作日为周一至周五，周末不工作',()=>{
  const calendar=createWorkCalendar();
  assert.equal(isWorkingDate('2026-08-14',calendar),true); // Friday
  assert.equal(isWorkingDate('2026-08-15',calendar),false); // Saturday
  assert.equal(isWorkingDate('2026-08-16',calendar),false); // Sunday
  assert.equal(isWorkingDate('2026-08-17',calendar),true); // Monday
  assert.equal(nextWorkingDate('2026-08-15',calendar),'2026-08-17');
});

test('公司休息日和特殊工作日覆盖常规星期规则，特殊工作日优先级最高',()=>{
  const calendar=createWorkCalendar({
    workingDays:[1,2,3,4,5],
    nonWorkingDates:['2026-08-17','2026-08-15'],
    workingDateOverrides:['2026-08-15']
  });
  assert.equal(workDateStatus('2026-08-17',calendar).label,'公司休息日');
  assert.equal(isWorkingDate('2026-08-17',calendar),false);
  assert.equal(workDateStatus('2026-08-15',calendar).label,'特殊工作日');
  assert.equal(isWorkingDate('2026-08-15',calendar),true);
});

test('工作日加减和区间计数跳过休息日',()=>{
  const calendar=createWorkCalendar();
  assert.equal(addWorkingDaysKey('2026-08-14',1,calendar),'2026-08-17');
  assert.equal(addWorkingDaysKey('2026-08-17',-1,calendar),'2026-08-14');
  assert.equal(countWorkingDates('2026-08-14','2026-08-18',calendar),3);
});

test('逐日产能在非工作日归零，但 Gantt 时间窗口仍可跨越周末',()=>{
  const db=fixture();
  const series=buildPersonCapacitySeries(db,db.people[0],{startDate:'2026-08-14',days:5});
  assert.deepEqual(series.map(day=>[day.date,day.workingDay,day.usage]),[
    ['2026-08-14',true,60],
    ['2026-08-15',false,0],
    ['2026-08-16',false,0],
    ['2026-08-17',true,60],
    ['2026-08-18',true,60]
  ]);
  assert.equal(series[1].calendarLabel,'常规休息日');
});

test('公司休息日把原工作日产能归零，特殊补班日恢复产能',()=>{
  const db=fixture();
  db.settings.planning.nonWorkingDates=['2026-08-17'];
  db.settings.planning.workingDateOverrides=['2026-08-15'];
  const series=buildPersonCapacitySeries(db,db.people[0],{startDate:'2026-08-14',days:5});
  assert.equal(series.find(day=>day.date==='2026-08-15').usage,60);
  assert.equal(series.find(day=>day.date==='2026-08-17').usage,0);
  assert.equal(series.find(day=>day.date==='2026-08-17').calendarLabel,'公司休息日');
});

test('连续可用产能按连续工作日计算，可自然跨过周末',()=>{
  const db=emptyDatabase();
  db.people.push({id:'u1',name:'甲',capacity:100,employmentStatus:'在岗'});
  const series=buildPersonCapacitySeries(db,db.people[0],{startDate:'2026-08-14',days:5});
  assert.equal(firstDateWithCapacity(series,100,{consecutiveDays:2}),'2026-08-14');
});

test('个人和团队预测保留日历天 horizon，但平均指标只统计工作日',()=>{
  const db=fixture();
  const person=forecastPersonCapacity(db,'u1',{startDate:'2026-08-14',horizons:[7]});
  assert.equal(person.windows[7].days,7);
  assert.equal(person.windows[7].workingDays,5);
  const team=forecastTeamCapacity(db,{startDate:'2026-08-14',horizons:[7]});
  assert.equal(team.windows[7].days,7);
  assert.equal(team.windows[7].workingDays,5);
});

test('Planning Dashboard 热力图区分休息日',()=>{
  const db=fixture();
  const model=buildPlanningDashboardModel(db,{startDate:'2026-08-14',horizons:[7],ganttDays:7,ganttViewportDays:7});
  assert.equal(model.heatmap.find(day=>day.date==='2026-08-15').level,'off');
  assert.equal(model.heatmap.find(day=>day.date==='2026-08-17').workingDay,true);
});

test('自动排期不会把常规周末作为建议开始日，但特殊补班日可以',()=>{
  const db=emptyDatabase();
  db.projects.push({id:'p1',name:'周末需求',status:'制作中',startDate:'2026-08-14',ddl:'2026-08-31'});
  db.people.push({id:'u1',name:'动画甲',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'高级'}]});
  db.staffingNeeds.push({id:'n1',projectId:'p1',role:'视频制作人员',stage:'视频',requiredCapacity:50,neededBy:'2026-08-15',status:'待安排'});
  let draft=generateConfiguredAutoScheduleDraft(db,{needIds:['n1'],startDate:'2026-08-15'});
  assert.equal(draft.proposals[0].startDate,'2026-08-17');
  assert.equal(draft.proposals[0].delayDays,2);

  db.settings.planning.workingDateOverrides=['2026-08-15'];
  draft=generateConfiguredAutoScheduleDraft(db,{needIds:['n1'],startDate:'2026-08-15'});
  assert.equal(draft.proposals[0].startDate,'2026-08-15');
  assert.equal(draft.proposals[0].delayDays,0);
});

test('Planning Settings 保存并规范化例外日期，运行配置可读取',()=>{
  const db=emptyDatabase();
  const result=updatePlanningSettings(db,{
    nonWorkingDates:['2026-10-01','2026-10-01','2026-10-02'],
    workingDateOverrides:['2026-10-10']
  });
  assert.equal(result.ok,true);
  assert.deepEqual(result.settings.nonWorkingDates,['2026-10-01','2026-10-02']);
  assert.deepEqual(result.settings.workingDateOverrides,['2026-10-10']);
  const config=resolvePlanningRuntimeConfig(result.database);
  assert.deepEqual(config.nonWorkingDates,['2026-10-01','2026-10-02']);
});

test('Planning Settings 拒绝真实无效日期而不是只检查字符串格式',()=>{
  const db=emptyDatabase();
  const result=updatePlanningSettings(db,{nonWorkingDates:['2026-02-30']});
  assert.equal(result.ok,false);
  assert.match(result.error,/公司休息日格式无效/);
});
