import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDatabase } from '../src/core.mjs';
import { CURRENT_DATABASE_VERSION, assertDatabase, normalizeDatabase } from '../src/schema/database.mjs';
import { createAppStore } from '../src/state/app-store.mjs';
import { selectDashboardModel, selectPeopleMetrics, selectScheduleModel } from '../src/state/selectors.mjs';

test('数据库 schema 边界统一迁移旧数据并校验当前版本',()=>{
  const db=normalizeDatabase({people:[{id:'u1',name:'旧人员',function:'视频制作'}]});
  assert.equal(db.version,CURRENT_DATABASE_VERSION);
  assert.equal(db.people[0].position,'AI动画师');
  assert.equal(assertDatabase(db).people.length,1);
  assert.equal(normalizeDatabase(null).version,CURRENT_DATABASE_VERSION);
});

test('App Store 集中维护视图、筛选、用户与数据库 revision',()=>{
  const store=createAppStore();
  const events=[];
  const unsubscribe=store.subscribe(event=>events.push(event.type));
  store.setUser({id:'u1',role:'manager'});
  store.setView('people');
  store.setFilters({peopleDepartment:'AI项目组'});
  const before=store.getState().revision;
  store.updateDatabase(db=>db.people.push({id:'p1',name:'测试人员',employmentStatus:'在岗'}));
  assert.equal(store.getState().view,'people');
  assert.equal(store.getState().filters.peopleDepartment,'AI项目组');
  assert.equal(store.getDatabase().people.length,1);
  assert.equal(store.getState().revision,before+1);
  assert.deepEqual(events,['user','view','filters','database:update']);
  unsubscribe();
});

test('App Store 数据更新失败时不提交半成品状态',()=>{
  const db=emptyDatabase();
  db.people.push({id:'u1',name:'原始人员'});
  const store=createAppStore({database:db});
  const revision=store.getState().revision;
  const result=store.updateDatabase(draft=>{
    draft.people.push({id:'u2',name:'不应保存'});
    return {ok:false,error:'业务校验失败'};
  });
  assert.equal(result.ok,false);
  assert.equal(store.getDatabase().people.length,1);
  assert.equal(store.getState().revision,revision);
});

test('Selectors 为总览、人员和调度输出一致的派生状态',()=>{
  const db=emptyDatabase();
  db.projects.push({id:'p1',name:'视频项目',status:'视频制作中',overallProgress:50,ddl:'2099-12-31'});
  db.people.push(
    {id:'director',name:'导演甲',positions:['导演'],position:'导演',capacity:100,employmentStatus:'在岗'},
    {id:'video',name:'视频甲',positions:['AI动画师'],position:'AI动画师',capacity:100,employmentStatus:'在岗'},
    {id:'inactive',name:'离岗甲',positions:['AI动画师'],position:'AI动画师',capacity:100,employmentStatus:'离岗'}
  );
  db.assignments.push(
    {id:'a1',projectId:'p1',personId:'director',role:'项目负责人/导演',stage:'统筹',allocation:30,status:'进行中'},
    {id:'a2',projectId:'p1',personId:'video',role:'视频制作人员',stage:'视频',allocation:60,status:'进行中'}
  );
  db.staffingNeeds.push({id:'n1',projectId:'p1',role:'PM',stage:'统筹',requiredCapacity:50,status:'待安排'});

  const dashboard=selectDashboardModel(db);
  const schedule=selectScheduleModel(db);
  const people=selectPeopleMetrics(db);
  assert.equal(dashboard.metrics.active,1);
  assert.ok(dashboard.gapProjects.some(item=>item.missing.some(role=>role.key==='pm')));
  assert.equal(schedule.needs.length,1);
  assert.equal(schedule.candidates.some(person=>person.id==='inactive'),false);
  assert.equal(people.total,3);
  assert.equal(people.inactive,1);
});
