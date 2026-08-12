import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDatabase, needAllocated, personUsage } from '../src/core.mjs';
import { buildDatabaseIndexes } from '../src/state/indexes.mjs';
import { executeResourceCommand } from '../src/services/resource-commands.mjs';

function fixture(){
  const db=emptyDatabase();
  db.projects.push({id:'p1',name:'项目一',status:'制作中'});
  db.people.push(
    {id:'u1',name:'甲',positions:['AI动画师'],position:'AI动画师',capacity:100,employmentStatus:'在岗'},
    {id:'u2',name:'乙',positions:['AI动画师'],position:'AI动画师',capacity:100,employmentStatus:'在岗'}
  );
  db.staffingNeeds.push({id:'n1',projectId:'p1',role:'视频制作人员',requiredCapacity:80,status:'待安排'});
  return db;
}

test('Command Service 不直接修改输入数据库，并集中写入 activity',()=>{
  const original=fixture();
  const result=executeResourceCommand(original,{type:'project.upsert',payload:{values:{name:'项目二',status:'待启动'}}},{now:new Date('2026-08-12T10:00:00+08:00')});
  assert.equal(result.ok,true);
  assert.equal(original.projects.length,1);
  assert.equal(result.database.projects.length,2);
  assert.equal(result.database.activity[0].type,'新建项目');
});

test('统一人员调度命令支持多人，并自动回算用人需求状态',()=>{
  const db=fixture();
  const result=executeResourceCommand(db,{type:'assignment.assign',payload:{
    projectId:'p1',personIds:['u1','u2'],needId:'n1',role:'视频制作人员',stage:'视频',allocation:40,status:'进行中'
  }},{now:new Date('2026-08-12T09:00:00+08:00')});
  assert.equal(result.ok,true);
  assert.equal(result.database.assignments.length,2);
  assert.equal(needAllocated(result.database,result.database.staffingNeeds[0]),80);
  assert.equal(result.database.staffingNeeds[0].status,'已满足');
});

test('移除分工后已满足需求自动重新打开',()=>{
  let db=fixture();
  db=executeResourceCommand(db,{type:'assignment.assign',payload:{projectId:'p1',personIds:['u1','u2'],needId:'n1',role:'视频制作人员',stage:'视频',allocation:40}}).database;
  assert.equal(db.staffingNeeds[0].status,'已满足');
  const removed=executeResourceCommand(db,{type:'assignment.remove',payload:{id:db.assignments[0].id}});
  assert.equal(removed.ok,true);
  assert.equal(removed.database.staffingNeeds[0].status,'待安排');
  assert.equal(needAllocated(removed.database,removed.database.staffingNeeds[0]),40);
});

test('人员删除命令级联删除分工并要求账号 reconciliation',()=>{
  let db=fixture();
  db=executeResourceCommand(db,{type:'assignment.assign',payload:{projectId:'p1',personId:'u1',needId:'n1',role:'视频制作人员',stage:'视频',allocation:50}}).database;
  const result=executeResourceCommand(db,{type:'person.delete',payload:{id:'u1'}});
  assert.equal(result.ok,true);
  assert.equal(result.database.people.some(item=>item.id==='u1'),false);
  assert.equal(result.database.assignments.some(item=>item.personId==='u1'),false);
  assert.deepEqual(result.effects,[{type:'syncPeopleAccounts'}]);
  assert.equal(result.database.staffingNeeds[0].status,'待安排');
});

test('Command Service 拒绝给非在岗人员排项目',()=>{
  const db=fixture();
  db.people[0].employmentStatus='离岗';
  const result=executeResourceCommand(db,{type:'assignment.assign',payload:{projectId:'p1',personId:'u1',role:'视频制作人员',allocation:20}});
  assert.equal(result.ok,false);
  assert.equal(result.code,'PERSON_NOT_SCHEDULABLE');
  assert.equal(db.assignments.length,0);
});

test('分工状态统一改为已取消后不继续占用产能',()=>{
  let db=fixture();
  db=executeResourceCommand(db,{type:'assignment.assign',payload:{projectId:'p1',personId:'u1',role:'其它支持',allocation:40}}).database;
  assert.equal(personUsage(db,'u1','2026-08-12'),40);
  const result=executeResourceCommand(db,{type:'assignment.status',payload:{id:db.assignments[0].id,status:'已取消'}});
  assert.equal(result.ok,true);
  assert.equal(personUsage(result.database,'u1','2026-08-12'),0);
});

test('数据库 indexes 一次构建人员、项目、分工、需求和产能索引',()=>{
  let db=fixture();
  db=executeResourceCommand(db,{type:'assignment.assign',payload:{projectId:'p1',personId:'u1',needId:'n1',role:'视频制作人员',allocation:30}}).database;
  const indexes=buildDatabaseIndexes(db,'2026-08-12');
  assert.equal(indexes.peopleById.get('u1').name,'甲');
  assert.equal(indexes.projectsById.get('p1').name,'项目一');
  assert.equal(indexes.assignmentsByPersonId.get('u1').length,1);
  assert.equal(indexes.assignmentsByProjectId.get('p1').length,1);
  assert.equal(indexes.needsByProjectId.get('p1').length,1);
  assert.equal(indexes.usageByPersonId.get('u1'),30);
});
