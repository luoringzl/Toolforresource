import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDatabase } from '../src/core.mjs';
import { buildPlanningDashboardModel, planningDashboardAlerts } from '../src/planning/planning-dashboard.mjs';

function fixture(){
  const db=emptyDatabase();
  db.projects.push(
    {id:'p1',name:'紧张项目',status:'视频制作中',startDate:'2026-08-10',ddl:'2026-08-31'},
    {id:'p2',name:'普通项目',status:'制作中',startDate:'2026-08-12',ddl:'2026-09-15'}
  );
  db.people.push(
    {id:'u1',name:'甲',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'高级'}]},
    {id:'u2',name:'乙',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'中级'}]},
    {id:'u3',name:'丙',capacity:100,employmentStatus:'离岗',position:'AI动画师',positions:['AI动画师']}
  );
  db.assignments.push(
    {id:'a1',projectId:'p1',personId:'u1',role:'视频制作人员',stage:'视频',allocation:80,status:'进行中',startDate:'2026-08-12',endDate:'2026-08-25'},
    {id:'a2',projectId:'p2',personId:'u1',role:'其它支持',stage:'其它',allocation:40,status:'进行中',startDate:'2026-08-15',endDate:'2026-08-20'}
  );
  db.staffingNeeds.push({id:'n1',projectId:'p1',role:'视频制作人员',stage:'视频',requiredCapacity:50,neededBy:'2026-08-12',status:'待安排'});
  return db;
}

test('Planning Dashboard 一次输出预测、冲突、需求、推荐和 Gantt',()=>{
  const db=fixture();
  // 避免旧版单角色需求兼容逻辑把现有 80% 视频分工直接算入 n1。
  db.assignments[0].role='其它支持';
  db.assignments[0].stage='其它';
  const model=buildPlanningDashboardModel(db,{startDate:'2026-08-12',horizons:[30,60,90],ganttDays:60,ganttViewportDays:14,recommendationDays:30,recommendationLimit:2});
  assert.equal(model.summary.people,3);
  assert.equal(model.summary.activeProjects,2);
  assert.equal(model.summary.openNeeds,1);
  assert.equal(model.horizonCards.length,3);
  assert.equal(model.heatmap.length,90);
  assert.ok(model.summary.conflictPeople>=1);
  assert.equal(model.openNeeds[0].gap,50);
  assert.equal(model.needRecommendations[0].candidates[0].person.id,'u2');
  assert.equal(model.resourceGanttViewport.columns.length,14);
  assert.equal(model.projectGanttViewport.columns.length,14);
});

test('Planning Dashboard 把超载人员按严重程度聚合',()=>{
  const db=fixture();
  const model=buildPlanningDashboardModel(db,{startDate:'2026-08-12',horizons:[30]});
  const conflict=model.conflictPeople.find(item=>item.person.id==='u1');
  assert.ok(conflict);
  assert.equal(conflict.maxUsage,120);
  assert.equal(conflict.maxOverload,20);
  assert.equal(conflict.severity,'high');
  assert.equal(conflict.firstDate,'2026-08-17');
  assert.equal(conflict.lastDate,'2026-08-20');
});

test('团队热力图区分休息日与工作日冲突',()=>{
  const db=fixture();
  const model=buildPlanningDashboardModel(db,{startDate:'2026-08-12',horizons:[30]});
  const weekend=model.heatmap.find(day=>day.date==='2026-08-15');
  assert.equal(weekend.level,'off');
  assert.equal(weekend.workingDay,false);
  const overload=model.heatmap.find(day=>day.date==='2026-08-17');
  assert.equal(overload.level,'overload');
  assert.equal(overload.overloadedPeople,1);
  const later=model.heatmap.find(day=>day.date==='2026-08-26');
  assert.ok(['low','medium','high','critical'].includes(later.level));
});

test('Planning Dashboard alerts 优先输出产能冲突',()=>{
  const db=fixture();
  const model=buildPlanningDashboardModel(db,{startDate:'2026-08-12',horizons:[30]});
  const alerts=planningDashboardAlerts(model);
  assert.ok(alerts.length>0);
  assert.equal(alerts[0].type,'capacity-conflict');
  assert.equal(alerts[0].personId,'u1');
  assert.match(alerts[0].text,/超载/);
});

test('无可用候选的需求会生成 staffing-no-candidate 告警',()=>{
  const db=emptyDatabase();
  db.projects.push({id:'p1',name:'无人项目',status:'制作中',startDate:'2026-08-12',ddl:'2026-08-20'});
  db.people.push({id:'u1',name:'离岗人员',capacity:100,employmentStatus:'离岗',position:'AI动画师',positions:['AI动画师']});
  db.staffingNeeds.push({id:'n1',projectId:'p1',role:'视频制作人员',requiredCapacity:50,neededBy:'2026-08-12',status:'待安排'});
  const model=buildPlanningDashboardModel(db,{startDate:'2026-08-12',horizons:[30]});
  const alerts=planningDashboardAlerts(model);
  assert.ok(alerts.some(item=>item.type==='staffing-no-candidate'&&item.needId==='n1'));
});
