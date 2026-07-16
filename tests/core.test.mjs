import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyDatabase, personUsage, personAvailable, projectHealth, needAllocated,
  dashboardMetrics, normalizeProjectRow, normalizePersonRow, roleColumns,
  assignmentConsumesCapacity, projectRoleCoverage, projectStaffingWarnings
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

test('资产制作完成后释放资产人员，但导演和视频人员直到项目完成才释放', () => {
  const db=emptyDatabase();
  db.projects.push({id:'p1',name:'阶段项目',status:'资产制作完成'});
  db.people.push(
    {id:'asset',name:'资产甲',capacity:100,employmentStatus:'在岗'},
    {id:'director',name:'导演甲',capacity:100,employmentStatus:'在岗'},
    {id:'video',name:'视频甲',capacity:100,employmentStatus:'在岗'}
  );
  db.assignments.push(
    {id:'a1',projectId:'p1',personId:'asset',role:'资产制作人员',stage:'资产',allocation:60,status:'进行中'},
    {id:'a2',projectId:'p1',personId:'director',role:'项目负责人/导演',stage:'统筹',allocation:50,status:'已结束',endDate:'2020-01-01'},
    {id:'a3',projectId:'p1',personId:'video',role:'视频制作人员',stage:'视频',allocation:70,status:'已结束',endDate:'2020-01-01'}
  );
  assert.equal(assignmentConsumesCapacity(db,db.assignments[0],'2026-07-16'),false);
  assert.equal(personUsage(db,'asset','2026-07-16'),0);
  assert.equal(personUsage(db,'director','2026-07-16'),50);
  assert.equal(personUsage(db,'video','2026-07-16'),70);
  db.projects[0].status='已完成';
  assert.equal(personUsage(db,'director','2026-07-16'),0);
  assert.equal(personUsage(db,'video','2026-07-16'),0);
});

test('五个核心岗位支持多人并识别阶段性缺员提醒', () => {
  const db=emptyDatabase();
  db.projects.push({id:'p1',name:'缺员项目',status:'视频制作中'});
  db.people.push({id:'u1',name:'导演甲'},{id:'u2',name:'导演乙'});
  db.assignments.push(
    {id:'a1',projectId:'p1',personId:'u1',role:'项目负责人/导演',status:'进行中'},
    {id:'a2',projectId:'p1',personId:'u2',role:'项目负责人/导演',status:'进行中'}
  );
  const coverage=projectRoleCoverage(db,'p1');
  assert.equal(coverage.find(item=>item.key==='director').count,2);
  assert.equal(coverage.filter(item=>item.covered).length,1);
  const warnings=projectStaffingWarnings(db,db.projects[0]);
  assert.ok(warnings.some(item=>item.critical&&item.text.includes('视频制作人员')));
  assert.ok(warnings.some(item=>item.text.includes('PM')));
});

test('用人需求自动计算已分配与缺口', () => {
  const db = fixture();
  assert.equal(needAllocated(db,db.staffingNeeds[0]),70);
});

test('总览指标识别活跃项目、可用人员、手工需求和核心岗位缺口', () => {
  const db = fixture();
  assert.deepEqual(dashboardMetrics(db), { active:1, risky:0, availablePeople:1, averageProgress:40, openNeeds:5 });
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
