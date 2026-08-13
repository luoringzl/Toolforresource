import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDatabase } from '../src/core.mjs';
import {
  createFillNeedScenario,
  createTransferAssignmentScenario,
  createPersonCapacityScenario,
  createProjectDatesScenario
} from '../src/planning/scenario-presets.mjs';

function fixture(){
  const db=emptyDatabase();
  db.projects.push({id:'p1',name:'项目A',status:'制作中',startDate:'2026-08-17',ddl:'2026-09-20'});
  db.people.push(
    {id:'u1',name:'甲',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师']},
    {id:'u2',name:'乙',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师']},
    {id:'u3',name:'丙',capacity:80,employmentStatus:'请假',position:'AI动画师',positions:['AI动画师']}
  );
  db.assignments.push({id:'a1',projectId:'p1',personId:'u1',role:'其它支持',stage:'其它',allocation:40,status:'进行中',startDate:'2026-08-17',endDate:'2026-09-20'});
  db.staffingNeeds.push({id:'n1',projectId:'p1',role:'视频制作人员',stage:'视频',requiredCapacity:60,neededBy:'2026-08-17',status:'待安排'});
  return db;
}

test('补齐需求预设按当前 gap 生成 assignment.assign',()=>{
  const result=createFillNeedScenario(fixture(),{needId:'n1',personId:'u2'});
  assert.equal(result.ok,true);
  assert.equal(result.scenario.commands.length,1);
  assert.equal(result.scenario.commands[0].type,'assignment.assign');
  assert.equal(result.scenario.commands[0].payload.needId,'n1');
  assert.equal(result.scenario.commands[0].payload.allocation,60);
});

test('补齐需求预设拒绝非在岗候选',()=>{
  const result=createFillNeedScenario(fixture(),{needId:'n1',personId:'u3'});
  assert.equal(result.ok,false);
  assert.match(result.error,/不在岗/);
});

test('转移分工预设生成 remove + assign 并保留投入和日期',()=>{
  const result=createTransferAssignmentScenario(fixture(),{assignmentId:'a1',targetPersonId:'u2'});
  assert.equal(result.ok,true);
  assert.deepEqual(result.scenario.commands.map(item=>item.type),['assignment.remove','assignment.assign']);
  const next=result.scenario.commands[1].payload;
  assert.equal(next.personId,'u2');
  assert.equal(next.allocation,40);
  assert.equal(next.startDate,'2026-08-17');
  assert.equal(next.endDate,'2026-09-20');
});

test('转移分工预设拒绝转给原人员',()=>{
  const result=createTransferAssignmentScenario(fixture(),{assignmentId:'a1',targetPersonId:'u1'});
  assert.equal(result.ok,false);
  assert.match(result.error,/相同/);
});

test('人员状态/产能预设完整保留人员档案，只覆盖假设字段',()=>{
  const db=fixture();
  const result=createPersonCapacityScenario(db,{personId:'u1',employmentStatus:'请假',capacity:60});
  assert.equal(result.ok,true);
  const command=result.scenario.commands[0];
  assert.equal(command.type,'person.upsert');
  assert.equal(command.payload.values.name,'甲');
  assert.equal(command.payload.values.employmentStatus,'请假');
  assert.equal(command.payload.values.capacity,60);
  assert.deepEqual(command.payload.values.positions,['AI动画师']);
});

test('人员产能预设拒绝异常数值',()=>{
  const result=createPersonCapacityScenario(fixture(),{personId:'u1',capacity:500});
  assert.equal(result.ok,false);
  assert.match(result.error,/0-300/);
});

test('项目日期预设完整保留项目并拒绝倒置日期',()=>{
  const db=fixture();
  const good=createProjectDatesScenario(db,{projectId:'p1',startDate:'2026-08-20',ddl:'2026-09-25',status:'视频制作中'});
  assert.equal(good.ok,true);
  assert.equal(good.scenario.commands[0].type,'project.upsert');
  assert.equal(good.scenario.commands[0].payload.values.name,'项目A');
  assert.equal(good.scenario.commands[0].payload.values.ddl,'2026-09-25');
  const bad=createProjectDatesScenario(db,{projectId:'p1',startDate:'2026-10-01',ddl:'2026-09-25'});
  assert.equal(bad.ok,false);
  assert.match(bad.error,/不能晚于/);
});
