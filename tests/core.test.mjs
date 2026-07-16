import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyDatabase, personUsage, personAvailable, projectHealth, needAllocated,
  dashboardMetrics, normalizeProjectRow, normalizePersonRow, roleColumns
} from '../src/core.mjs';

function fixture() {
  const db = emptyDatabase();
  db.projects.push({ id:'p1', name:'项目一', status:'制作中', overallProgress:40, ddl:'2099-12-31' });
  db.people.push({ id:'u1', name:'小林', function:'视频制作', capacity:100, employmentStatus:'在岗' });
  db.assignments.push({ id:'a1', projectId:'p1', personId:'u1', role:'视频制作', allocation:70, status:'进行中', endDate:'2099-12-31' });
  db.staffingNeeds.push({ id:'n1', projectId:'p1', role:'视频制作', requiredCapacity:100, status:'待安排' });
  return db;
}

test('人员产能由有效项目分工实时汇总', () => {
  const db = fixture();
  assert.equal(personUsage(db,'u1','2026-07-16'),70);
  assert.equal(personAvailable(db,db.people[0]),30);
  db.assignments.push({ id:'a2', projectId:'p1', personId:'u1', role:'剪辑', allocation:40, status:'进行中' });
  assert.equal(personAvailable(db,db.people[0]),0);
});

test('已完成项目不继续占用人员产能', () => {
  const db = fixture();
  db.projects[0].status='已完成';
  assert.equal(personUsage(db,'u1','2026-07-16'),0);
});

test('用人需求自动计算已分配与缺口', () => {
  const db = fixture();
  assert.equal(needAllocated(db,db.staffingNeeds[0]),70);
});

test('总览指标识别活跃项目、可用人员和需求', () => {
  const db = fixture();
  assert.deepEqual(dashboardMetrics(db), { active:1, risky:0, availablePeople:1, averageProgress:40, openNeeds:1 });
});

test('项目健康度识别风险备注与逾期', () => {
  assert.equal(projectHealth({status:'制作中',riskNote:'客户素材缺失'}).key,'risk');
  assert.equal(projectHealth({status:'制作中',ddl:'2020-01-01',overallProgress:20},new Date('2026-07-16')).key,'overdue');
  assert.equal(projectHealth({status:'已完成'}).key,'done');
});

test('导入行被标准化，百分比被限制在 0-100', () => {
  const project=normalizeProjectRow({'项目名称':'A','项目总进度':130,'项目状态':'制作中'});
  const person=normalizePersonRow({'姓名':'B','标准产能':80,'职能':'导演'});
  assert.equal(project.overallProgress,100);
  assert.equal(person.capacity,80);
});

test('项目人员列支持顿号、逗号和分号', () => {
  const roles=roleColumns({'视频制作人员':'甲、乙,丙；丁'});
  assert.equal(roles.length,4);
  assert.ok(roles.every(item=>item.role==='视频制作'));
});
