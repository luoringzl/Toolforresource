import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDatabase } from '../src/core.mjs';
import { optimizeDependencyAwareSchedule } from '../src/planning/dependency-aware-optimizer.mjs';

function fixture(){
  const db=emptyDatabase();
  db.projects.push(
    {id:'A',name:'前置项目',status:'制作中',startDate:'2026-08-17',ddl:'2026-08-21',plannedDurationDays:5},
    {id:'B',name:'阻塞项目',status:'待启动',startDate:'2026-08-17',ddl:'2026-08-31',plannedDurationDays:4,dependencies:[{predecessorId:'A',type:'FS'}]},
    {id:'C',name:'可排项目',status:'制作中',startDate:'2026-08-17',ddl:'2026-08-28',plannedDurationDays:3}
  );
  db.people.push(
    {id:'u1',name:'动画甲',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'高级'}]},
    {id:'u2',name:'动画乙',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'高级'}]}
  );
  db.staffingNeeds.push(
    {id:'nB',projectId:'B',role:'视频制作人员',stage:'视频',requiredCapacity:50,neededBy:'2026-08-17',status:'待安排'},
    {id:'nC',projectId:'C',role:'视频制作人员',stage:'视频',requiredCapacity:60,neededBy:'2026-08-17',status:'待安排'}
  );
  return db;
}

test('多策略优化只接收 dependency-ready 需求',()=>{
  const result=optimizeDependencyAwareSchedule(fixture(),{objective:'balanced',startDate:'2026-08-17'});
  assert.equal(result.ok,true);
  assert.deepEqual(result.plan.eligibleNeeds.map(item=>item.need.id),['nC']);
  assert.deepEqual(result.plan.blockedNeeds.map(item=>item.need.id),['nB']);
  assert.ok(result.optimization.options.length>0);
  for(const option of result.optimization.options){
    assert.ok(option.draft.proposals.length>0);
    assert.ok(option.draft.proposals.every(proposal=>proposal.needId==='nC'));
  }
  assert.ok(result.optimization.recommended.draft.proposals.every(proposal=>proposal.projectId==='C'));
});

test('全部需求被阻塞时优化器返回空方案而不是回退为全量需求',()=>{
  const db=fixture();
  db.staffingNeeds=db.staffingNeeds.filter(item=>item.id==='nB');
  const result=optimizeDependencyAwareSchedule(db,{objective:'onTime',startDate:'2026-08-17'});
  assert.equal(result.ok,true);
  assert.equal(result.plan.eligibleNeeds.length,0);
  assert.equal(result.plan.blockedNeeds.length,1);
  assert.equal(result.optimization.options.length,0);
  assert.equal(result.optimization.recommended,null);
});

test('前置完成后原 blocked 需求进入多方案优化',()=>{
  const db=fixture();
  db.projects.find(project=>project.id==='A').status='已完成';
  const result=optimizeDependencyAwareSchedule(db,{objective:'balanced',startDate:'2026-08-17'});
  assert.equal(result.plan.blockedNeeds.length,0);
  assert.equal(result.plan.eligibleNeeds.length,2);
  const proposalNeeds=new Set(result.optimization.recommended.draft.proposals.map(item=>item.needId));
  assert.equal(proposalNeeds.has('nB'),true);
  assert.equal(proposalNeeds.has('nC'),true);
});
