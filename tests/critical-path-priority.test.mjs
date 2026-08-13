import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDatabase } from '../src/core.mjs';
import {
  buildCriticalPathNeedPriorityModel,
  generateCriticalPathPriorityDraft,
  optimizeCriticalPathPrioritySchedule
} from '../src/planning/critical-path-priority.mjs';

function scarcityFixture(){
  const db=emptyDatabase();
  db.projects.push(
    {
      id:'A',name:'关键长项目',status:'制作中',priority:'P2 中',
      startDate:'2026-08-17',ddl:'2026-08-28',plannedDurationDays:10
    },
    {
      id:'C',name:'普通紧急项目',status:'制作中',priority:'P0 紧急',
      startDate:'2026-08-17',ddl:'2026-08-28',plannedDurationDays:3
    }
  );
  db.people.push({
    id:'u1',name:'唯一动画师',capacity:50,employmentStatus:'在岗',
    position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'高级'}]
  });
  db.staffingNeeds.push(
    {id:'nA',projectId:'A',role:'视频制作人员',stage:'视频',requiredCapacity:50,neededBy:'2026-08-17',status:'待安排'},
    {id:'nC',projectId:'C',role:'视频制作人员',stage:'视频',requiredCapacity:50,neededBy:'2026-08-17',status:'待安排'}
  );
  return db;
}

function dependencyFixture(){
  const db=emptyDatabase();
  db.projects.push(
    {id:'P',name:'前置项目',status:'制作中',priority:'P2 中',startDate:'2026-08-17',ddl:'2026-08-21',plannedDurationDays:5},
    {id:'B',name:'被阻塞项目',status:'待启动',priority:'P0 紧急',startDate:'2026-08-17',ddl:'2026-08-31',plannedDurationDays:5,dependencies:[{predecessorId:'P',type:'FS'}]},
    {id:'R',name:'Ready 关键项目',status:'制作中',priority:'P1 高',startDate:'2026-08-17',ddl:'2026-08-28',plannedDurationDays:8}
  );
  db.people.push({id:'u1',name:'动画甲',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'高级'}]});
  db.staffingNeeds.push(
    {id:'nB',projectId:'B',role:'视频制作人员',stage:'视频',requiredCapacity:50,neededBy:'2026-08-17',status:'待安排'},
    {id:'nR',projectId:'R',role:'视频制作人员',stage:'视频',requiredCapacity:50,neededBy:'2026-08-17',status:'待安排'}
  );
  return db;
}

test('关键路径需求在同日同缺口下优先级高于普通 P0 项目',()=>{
  const model=buildCriticalPathNeedPriorityModel(scarcityFixture(),{startDate:'2026-08-17'});
  assert.equal(model.ok,true);
  assert.equal(model.priorities.length,2);
  assert.equal(model.priorities[0].need.id,'nA');
  assert.equal(model.priorities[0].critical,true);
  assert.ok(model.priorities[0].priorityScore>model.priorities[1].priorityScore);
  assert.ok(model.priorities[0].priorityReasons.includes('关键路径'));
  assert.match(model.priorities[1].priorityReasons.join('；'),/P0/);
});

test('稀缺单人产能按关键路径优先顺序预留，普通项目留下缺口',()=>{
  const result=generateCriticalPathPriorityDraft(scarcityFixture(),{
    startDate:'2026-08-17',autoScheduleDays:10,maxChunk:50,minChunk:50,maxPeoplePerNeed:1
  });
  assert.equal(result.ok,true);
  assert.deepEqual(result.draft.priorityOrder.map(item=>item.needId),['nA','nC']);
  assert.equal(result.draft.proposals.length,1);
  assert.equal(result.draft.proposals[0].needId,'nA');
  assert.equal(result.draft.proposals[0].personId,'u1');
  assert.ok(result.draft.unresolved.some(item=>item.needId==='nC'&&item.remaining===50));
  assert.equal(result.draft.unresolved.some(item=>item.needId==='nA'),false);
});

test('blocked 需求继承 V2.6 门控，不进入关键路径优先队列或草案',()=>{
  const result=generateCriticalPathPriorityDraft(dependencyFixture(),{startDate:'2026-08-17'});
  assert.equal(result.ok,true);
  assert.deepEqual(result.priorityModel.plan.blockedNeeds.map(item=>item.need.id),['nB']);
  assert.deepEqual(result.priorityModel.priorities.map(item=>item.need.id),['nR']);
  assert.equal(result.draft.proposals.some(item=>item.needId==='nB'),false);
  assert.equal(result.draft.priorityOrder.some(item=>item.needId==='nB'),false);
});

test('关键路径预计逾期会进一步提高需求优先级',()=>{
  const db=emptyDatabase();
  db.projects.push(
    {id:'late',name:'已晚关键项目',status:'制作中',priority:'P2 中',startDate:'2026-08-17',ddl:'2026-08-18',plannedDurationDays:6},
    {id:'normal',name:'正常关键项目',status:'制作中',priority:'P2 中',startDate:'2026-08-17',ddl:'2026-08-28',plannedDurationDays:6}
  );
  db.people.push({id:'u1',name:'甲',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师']});
  db.staffingNeeds.push(
    {id:'nLate',projectId:'late',role:'视频制作人员',requiredCapacity:30,neededBy:'2026-08-17',status:'待安排'},
    {id:'nNormal',projectId:'normal',role:'视频制作人员',requiredCapacity:30,neededBy:'2026-08-17',status:'待安排'}
  );
  const model=buildCriticalPathNeedPriorityModel(db,{startDate:'2026-08-17'});
  const late=model.priorities.find(item=>item.need.id==='nLate');
  const normal=model.priorities.find(item=>item.need.id==='nNormal');
  assert.ok(late.state.node.lateByWorkingDays>0);
  assert.ok(late.priorityScore>normal.priorityScore);
  assert.ok(late.priorityReasons.some(reason=>reason.includes('预计晚')));
});

test('非关键项目的总浮动时间会降低人员优先级',()=>{
  const db=emptyDatabase();
  db.projects.push(
    {id:'A',name:'前置',status:'已完成',startDate:'2026-08-17',ddl:'2026-08-18',plannedDurationDays:2},
    {id:'B',name:'关键后续',status:'制作中',priority:'P2 中',startDate:'2026-08-17',ddl:'2026-08-28',plannedDurationDays:7,dependencies:[{predecessorId:'A',type:'FS'}]},
    {id:'C',name:'有浮动支线',status:'制作中',priority:'P2 中',startDate:'2026-08-17',ddl:'2026-08-28',plannedDurationDays:2,dependencies:[{predecessorId:'A',type:'FS'}]},
    {id:'D',name:'汇合',status:'制作中',priority:'P2 中',startDate:'2026-08-17',ddl:'2026-09-04',plannedDurationDays:2,dependencies:[{predecessorId:'B',type:'FS'},{predecessorId:'C',type:'FS'}]}
  );
  db.people.push({id:'u1',name:'甲',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师']});
  db.staffingNeeds.push(
    {id:'nB',projectId:'B',role:'视频制作人员',requiredCapacity:40,neededBy:'2026-08-19',status:'待安排'},
    {id:'nC',projectId:'C',role:'视频制作人员',requiredCapacity:40,neededBy:'2026-08-19',status:'待安排'}
  );
  const model=buildCriticalPathNeedPriorityModel(db,{startDate:'2026-08-17'});
  const b=model.priorities.find(item=>item.need.id==='nB');
  const c=model.priorities.find(item=>item.need.id==='nC');
  assert.equal(b.critical,true);
  assert.equal(c.critical,false);
  assert.ok(c.state.node.totalFloatDays>0);
  assert.ok(b.priorityScore>c.priorityScore);
  assert.ok(c.priorityReasons.some(reason=>reason.includes('浮动')));
});

test('多策略优化的每个方案都保持同一关键路径需求处理顺序',()=>{
  const result=optimizeCriticalPathPrioritySchedule(scarcityFixture(),{
    objective:'balanced',startDate:'2026-08-17',autoScheduleDays:10
  });
  assert.equal(result.ok,true);
  assert.ok(result.options.length>=1);
  for(const option of result.options){
    assert.deepEqual(option.draft.priorityOrder.map(item=>item.needId),['nA','nC']);
    const firstProposal=option.draft.proposals[0];
    assert.equal(firstProposal.needId,'nA');
  }
  assert.equal(result.recommended.draft.priorityOrder[0].needId,'nA');
});

test('关键路径优先草案合并后仍做整体冲突校验',()=>{
  const db=scarcityFixture();
  db.people[0].capacity=100;
  const result=generateCriticalPathPriorityDraft(db,{
    startDate:'2026-08-17',autoScheduleDays:10,maxChunk:50,minChunk:50,maxPeoplePerNeed:1
  });
  assert.equal(result.ok,true);
  assert.equal(result.draft.proposals.length,2);
  assert.equal(result.draft.conflicts.length,0);
  assert.equal(result.draft.feasible,true);
  assert.equal(result.draft.summary.allocatedCapacity,100);
});
