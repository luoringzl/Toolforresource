import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDatabase } from '../src/core.mjs';
import {
  buildDependencyAwareStaffingPlan,
  buildProjectDependencySchedulingStates,
  criticalPathStaffingAlerts
} from '../src/planning/dependency-aware-scheduling.mjs';

function fixture(){
  const db=emptyDatabase();
  db.projects.push(
    {id:'A',name:'前置项目',status:'制作中',startDate:'2026-08-17',ddl:'2026-08-21',plannedDurationDays:5},
    {id:'B',name:'后续项目',status:'待启动',startDate:'2026-08-17',ddl:'2026-08-31',plannedDurationDays:5,dependencies:[{predecessorId:'A',type:'FS',lagDays:0}]},
    {id:'C',name:'独立项目',status:'制作中',startDate:'2026-08-17',ddl:'2026-08-28',plannedDurationDays:3}
  );
  db.people.push(
    {id:'u1',name:'动画甲',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'高级'}]},
    {id:'u2',name:'动画乙',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'高级'}]}
  );
  db.staffingNeeds.push(
    {id:'nB',projectId:'B',role:'视频制作人员',stage:'视频',requiredCapacity:50,neededBy:'2026-08-17',status:'待安排'},
    {id:'nC',projectId:'C',role:'视频制作人员',stage:'视频',requiredCapacity:40,neededBy:'2026-08-17',status:'待安排'}
  );
  return db;
}

test('FS 前置未完成时后续项目进入 blocked，独立项目保持 ready',()=>{
  const model=buildProjectDependencySchedulingStates(fixture(),{startDate:'2026-08-17'});
  assert.equal(model.ok,true);
  const b=model.states.find(item=>item.project.id==='B');
  const c=model.states.find(item=>item.project.id==='C');
  assert.equal(b.readyNow,false);
  assert.equal(b.blocked,true);
  assert.equal(b.blockers.length,1);
  assert.equal(b.blockers[0].predecessor.id,'A');
  assert.equal(c.readyNow,true);
});

test('依赖感知自动排期只处理 ready 项目，不提前给 blocked 项目占人',()=>{
  const plan=buildDependencyAwareStaffingPlan(fixture(),{startDate:'2026-08-17',autoScheduleDays:30});
  assert.equal(plan.ok,true);
  assert.deepEqual(plan.eligibleNeeds.map(item=>item.need.id),['nC']);
  assert.deepEqual(plan.blockedNeeds.map(item=>item.need.id),['nB']);
  assert.equal(plan.draft.proposals.length,1);
  assert.equal(plan.draft.proposals[0].needId,'nC');
  assert.equal(plan.draft.proposals.some(item=>item.needId==='nB'),false);
  assert.equal(plan.summary.blockedCapacity,50);
  assert.equal(plan.summary.eligibleCapacity,40);
  assert.equal(plan.fullySchedulableNow,false);
});

test('没有任何 ready 需求时返回空草案，而不是因 needIds=[] 误排全部需求',()=>{
  const db=fixture();
  db.staffingNeeds=db.staffingNeeds.filter(item=>item.id==='nB');
  const plan=buildDependencyAwareStaffingPlan(db,{startDate:'2026-08-17'});
  assert.equal(plan.eligibleNeeds.length,0);
  assert.equal(plan.blockedNeeds.length,1);
  assert.equal(plan.draft.requestedNeeds,0);
  assert.equal(plan.draft.proposals.length,0);
  assert.equal(plan.draft.summary.allocatedCapacity,0);
});

test('前置项目完成后后续需求进入可排队列并生成真实草案',()=>{
  const db=fixture();
  db.projects.find(item=>item.id==='A').status='已完成';
  const plan=buildDependencyAwareStaffingPlan(db,{startDate:'2026-08-17'});
  assert.equal(plan.blockedNeeds.length,0);
  assert.equal(plan.eligibleNeeds.length,2);
  assert.ok(plan.draft.proposals.some(item=>item.needId==='nB'));
  assert.ok(plan.draft.proposals.some(item=>item.needId==='nC'));
  assert.equal(plan.fullySchedulableNow,true);
});

test('SS 依赖在前置项目已启动时允许排人，不要求前置完成',()=>{
  const db=fixture();
  db.projects.find(item=>item.id==='B').dependencies=[{predecessorId:'A',type:'SS',lagDays:0}];
  const plan=buildDependencyAwareStaffingPlan(db,{startDate:'2026-08-17'});
  assert.equal(plan.blockedNeeds.some(item=>item.need.id==='nB'),false);
  assert.ok(plan.eligibleNeeds.some(item=>item.need.id==='nB'));
});

test('ready 项目的建议开始日不会早于项目网络计划开始日',()=>{
  const db=fixture();
  db.projects.find(item=>item.id==='A').status='已完成';
  db.projects.find(item=>item.id==='B').startDate='2026-08-24';
  db.staffingNeeds.find(item=>item.id==='nB').neededBy='2026-08-17';
  const plan=buildDependencyAwareStaffingPlan(db,{startDate:'2026-08-17',autoScheduleDays:30});
  const need=plan.eligibleNeeds.find(item=>item.need.id==='nB');
  const proposal=plan.draft.proposals.find(item=>item.needId==='nB');
  assert.equal(need.earliestStaffingDate,'2026-08-24');
  assert.ok(proposal.startDate>='2026-08-24');
});

test('blockedPreview 返回前置项目名称、状态和最早规划日期，但不生成 assignment command',()=>{
  const plan=buildDependencyAwareStaffingPlan(fixture(),{startDate:'2026-08-17'});
  assert.equal(plan.blockedPreview.length,1);
  const preview=plan.blockedPreview[0];
  assert.equal(preview.needId,'nB');
  assert.equal(preview.blockers[0].predecessorName,'前置项目');
  assert.equal(preview.blockers[0].predecessorStatus,'制作中');
  assert.ok(preview.earliestStaffingDate);
  assert.equal(plan.draft.proposals.some(item=>item.needId==='nB'),false);
});

test('关键路径人员缺口与 DDL 风险生成高优先级告警',()=>{
  const db=emptyDatabase();
  db.projects.push(
    {id:'A',name:'关键前置',status:'制作中',startDate:'2026-08-17',ddl:'2026-08-18',plannedDurationDays:4},
    {id:'B',name:'关键后续',status:'待启动',startDate:'2026-08-17',ddl:'2026-08-19',plannedDurationDays:4,dependencies:[{predecessorId:'A',type:'FS'}]}
  );
  db.staffingNeeds.push({id:'nA',projectId:'A',role:'视频制作人员',requiredCapacity:60,neededBy:'2026-08-17',status:'待安排'});
  const alerts=criticalPathStaffingAlerts(db,{startDate:'2026-08-17'});
  assert.ok(alerts.some(item=>item.type==='critical-path-staffing-gap'&&item.projectId==='A'&&item.severity==='high'));
  assert.ok(alerts.some(item=>item.type==='critical-path-deadline'&&item.severity==='critical'));
});

test('blocked 的关键路径缺口不会被描述成“立即补齐”，而是说明前置阻塞',()=>{
  const db=fixture();
  const alerts=criticalPathStaffingAlerts(db,{startDate:'2026-08-17'});
  const item=alerts.find(alert=>alert.type==='critical-path-staffing-gap'&&alert.projectId==='B');
  assert.ok(item);
  assert.equal(item.blocked,true);
  assert.equal(item.severity,'warning');
  assert.match(item.text,/前置条件阻塞/);
});

test('依赖网络存在循环时排期门控直接失败，不生成任何自动分配',()=>{
  const db=fixture();
  db.projects.find(item=>item.id==='A').dependencies=[{predecessorId:'B',type:'FS'}];
  const plan=buildDependencyAwareStaffingPlan(db,{startDate:'2026-08-17'});
  assert.equal(plan.ok,false);
  assert.match(plan.error,/循环/);
  assert.equal(plan.draft.proposals.length,0);
  assert.ok(plan.alerts.some(item=>item.type==='dependency-network-invalid'));
});
