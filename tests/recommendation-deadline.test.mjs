import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDatabase } from '../src/core.mjs';
import { scoreAssignmentCandidate } from '../src/planning/recommendation-engine.mjs';
import { generateConfiguredAutoScheduleDraft } from '../src/planning/planning-runtime.mjs';

test('候选人只在项目 DDL 之前搜索可用产能，DDL 后空闲不得成为有效建议',()=>{
  const db=emptyDatabase();
  db.projects.push(
    {id:'busyProject',name:'占用项目',status:'制作中',startDate:'2026-08-17',ddl:'2026-08-28'},
    {id:'target',name:'目标项目',status:'制作中',startDate:'2026-08-17',ddl:'2026-08-28'}
  );
  const person={id:'u1',name:'动画甲',capacity:50,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'高级'}]};
  db.people.push(person);
  db.assignments.push({id:'busy',projectId:'busyProject',personId:'u1',role:'视频制作人员',stage:'视频',allocation:50,status:'进行中',startDate:'2026-08-17',endDate:'2026-08-28'});

  const candidate=scoreAssignmentCandidate(db,person,{
    projectId:'target',role:'视频制作人员',stage:'视频',allocation:50,
    startDate:'2026-08-17',endDate:'2026-08-28'
  },{startDate:'2026-08-17',days:60});

  assert.ok(candidate);
  assert.equal(candidate.firstAvailableDate,'');
  assert.ok(candidate.risks.some(risk=>risk.includes('项目结束日前无连续可用产能')));
});

test('自动排期不会生成开始日期晚于项目 DDL 的 proposal',()=>{
  const db=emptyDatabase();
  db.projects.push(
    {id:'busyProject',name:'占用项目',status:'制作中',startDate:'2026-08-17',ddl:'2026-08-28'},
    {id:'target',name:'目标项目',status:'制作中',startDate:'2026-08-17',ddl:'2026-08-28'}
  );
  db.people.push({id:'u1',name:'动画甲',capacity:50,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'高级'}]});
  db.assignments.push({id:'busy',projectId:'busyProject',personId:'u1',role:'视频制作人员',stage:'视频',allocation:50,status:'进行中',startDate:'2026-08-17',endDate:'2026-08-28'});
  db.staffingNeeds.push({id:'need',projectId:'target',role:'视频制作人员',stage:'视频',requiredCapacity:50,neededBy:'2026-08-17',status:'待安排'});

  const draft=generateConfiguredAutoScheduleDraft(db,{startDate:'2026-08-17',needIds:['need'],autoScheduleDays:60});
  assert.equal(draft.proposals.length,0);
  assert.equal(draft.unresolved.length,1);
  assert.equal(draft.unresolved[0].needId,'need');
});
