import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyDatabase, personUsage, personAvailable, projectHealth, needAllocated,
  dashboardMetrics, normalizeProjectRow, normalizePersonRow, roleColumns,
  assignmentConsumesCapacity, projectRoleCoverage, projectStaffingWarnings,
  personRemainingCapacity, personWorkloadBreakdown, migrateDatabase, parseSkillProfiles, parseProductionCapabilities, compareProjects
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

test('其它部门项目计入产能，超负荷保留负数剩余产能', () => {
  const db=fixture();
  db.people[0].externalAssignments=[{id:'e1',name:'内部培训',department:'教培部门',allocation:50,status:'进行中',endDate:'2099-12-31'}];
  assert.equal(personUsage(db,'u1','2026-07-16'),120);
  assert.equal(personRemainingCapacity(db,db.people[0],'2026-07-16'),-20);
  assert.equal(personAvailable(db,db.people[0],'2026-07-16'),0);
  assert.equal(personWorkloadBreakdown(db,'u1','2026-07-16').length,2);
});

test('预计释放日期仅作参考，可排状态由全部有效项目占用和在岗状态决定', () => {
  const db=fixture();
  db.people[0].releaseDate='2099-01-01';
  assert.equal(personAvailable(db,db.people[0],'2026-07-16'),30);
  db.people[0].releaseDate='';
  db.people[0].externalAssignments=[{id:'e1',name:'持续管理',department:'商务部门',allocation:30,status:'进行中',endDate:''}];
  assert.equal(personAvailable(db,db.people[0],'2026-07-16'),0);
  db.people[0].externalAssignments=[];db.people[0].employmentStatus='请假';
  assert.equal(personAvailable(db,db.people[0],'2026-07-16'),0);
});

test('项目默认按进行中、待启动、暂停、已完结分组，并按优先级和接单日期排序', () => {
  const projects=[
    {name:'已完成项目',status:'已完成',priority:'P0 紧急',orderDate:'2026-01-01'},
    {name:'待启动项目',status:'待启动',priority:'P0 紧急',orderDate:'2026-01-01'},
    {name:'进行中较新项目',status:'视频制作中',priority:'P1 高',orderDate:'2026-06-01'},
    {name:'进行中较早项目',status:'制作中',priority:'P1 高',orderDate:'2026-05-01'},
    {name:'进行中紧急项目',status:'反馈修改中',priority:'P0 紧急',orderDate:'2026-07-01'},
    {name:'暂停项目',status:'暂停',priority:'P0 紧急',orderDate:'2026-01-01'}
  ];
  assert.deepEqual(projects.sort(compareProjects).map(item=>item.name),[
    '进行中紧急项目','进行中较早项目','进行中较新项目','待启动项目','暂停项目','已完成项目'
  ]);
});

test('旧版人员资料自动迁移为部门职位与技能等级模型', () => {
  const db=migrateDatabase({people:[{id:'u1',name:'旧员工',function:'视频制作',skills:'AI视频制作、剪辑',skillLevel:'高级'}]});
  assert.equal(db.version,2);
  assert.equal(db.people[0].position,'AI动画师');
  assert.deepEqual(db.people[0].skillProfiles,[{skill:'AI视频制作',level:'高级'},{skill:'剪辑',level:'高级'}]);
});

test('人员导入模板语法解析技能等级与分方向制作能力', () => {
  assert.deepEqual(parseSkillProfiles('AI视频制作|高级；剪辑|中级'),[{skill:'AI视频制作',level:'高级'},{skill:'剪辑',level:'中级'}]);
  assert.deepEqual(parseProductionCapabilities('AI视频制作|2|分钟/天|电影级|'),[{skill:'AI视频制作',quantity:'2',unit:'分钟/天',complexity:'电影级',note:''}]);
  const person=normalizePersonRow({'人员姓名':'小周','归属部门':'AI项目组','职位':'AI动画师','技能与等级':'AI视频制作|高级','标准总产能':120});
  assert.equal(person.capacity,120);
  assert.equal(person.skillProfiles[0].level,'高级');
});
