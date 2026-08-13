import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDatabase } from '../src/core.mjs';
import { evaluateScheduleDraft, optimizeSchedule, scheduleDraftMetrics, scheduleOptionCommands } from '../src/planning/schedule-optimizer.mjs';

function freeFixture(){
  const db=emptyDatabase();
  db.projects.push({id:'p1',name:'项目A',status:'制作中',priority:'P1 高',startDate:'2026-08-17',ddl:'2026-09-30'});
  db.people.push(
    {id:'u1',name:'甲',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'高级'}]},
    {id:'u2',name:'乙',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'高级'}]},
    {id:'u3',name:'丙',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'中级'}]}
  );
  db.staffingNeeds.push({id:'n1',projectId:'p1',role:'视频制作人员',stage:'视频',requiredCapacity:80,neededBy:'2026-08-17',status:'待安排'});
  return db;
}

function constrainedFixture(){
  const db=emptyDatabase();
  db.projects.push(
    {id:'p1',name:'新项目',status:'制作中',priority:'P0 紧急',startDate:'2026-08-17',ddl:'2026-09-20'},
    {id:'busy',name:'存量项目',status:'制作中',priority:'P2 中',startDate:'2026-08-01',ddl:'2026-09-30'}
  );
  for(let index=1;index<=4;index++){
    db.people.push({id:`u${index}`,name:`动画${index}`,capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'高级'}]});
    db.assignments.push({id:`a${index}`,projectId:'busy',personId:`u${index}`,role:'其它支持',stage:'其它',allocation:70,status:'进行中',startDate:'2026-08-17',endDate:'2026-09-20'});
  }
  db.staffingNeeds.push({id:'n1',projectId:'p1',role:'视频制作人员',stage:'视频',requiredCapacity:100,neededBy:'2026-08-17',status:'待安排'});
  return db;
}

test('scheduleDraftMetrics 汇总延期、缺口、人数和候选质量',()=>{
  const metrics=scheduleDraftMetrics({
    requestedNeeds:2,resolvedNeeds:1,
    proposals:[
      {personId:'u1',allocation:50,delayDays:0,score:100,risks:[]},
      {personId:'u2',allocation:30,delayDays:3,score:80,risks:['技能仅部分匹配','晚于期望到岗 3 天']}
    ],
    unresolved:[{remaining:20}],conflicts:[{date:'2026-08-20'}]
  });
  assert.equal(metrics.proposalCount,2);
  assert.equal(metrics.proposedPeople,2);
  assert.equal(metrics.unresolvedCapacity,20);
  assert.equal(metrics.conflictCount,1);
  assert.equal(metrics.delayedProposals,1);
  assert.equal(metrics.totalDelayDays,3);
  assert.equal(metrics.riskCount,1);
  assert.equal(metrics.averageRecommendationScore,90);
});

test('同一草案在按期目标下会更重地惩罚延期',()=>{
  const draft={requestedNeeds:1,resolvedNeeds:1,proposals:[{personId:'u1',allocation:50,delayDays:5,score:100,risks:['晚于期望到岗 5 天']}],unresolved:[],conflicts:[]};
  const balanced=evaluateScheduleDraft(draft,{objective:'balanced'});
  const onTime=evaluateScheduleDraft(draft,{objective:'onTime'});
  assert.ok(onTime.optimizerScore<balanced.optimizerScore);
  assert.match(onTime.explanations.join('；'),/延期/);
});

test('少人集中目标在自由产能场景优先选择单人方案',()=>{
  const result=optimizeSchedule(freeFixture(),{objective:'concentrated',startDate:'2026-08-17',needIds:['n1']});
  assert.ok(result.options.length>=2);
  assert.equal(result.recommended.metrics.unresolvedCapacity,0);
  assert.equal(result.recommended.metrics.proposedPeople,1);
  assert.equal(result.recommended.label,'少人集中');
  assert.equal(result.recommended.rank,1);
});

test('有明显余量约束时，留下缺口的集中方案自动降级',()=>{
  const result=optimizeSchedule(constrainedFixture(),{objective:'balanced',startDate:'2026-08-17',needIds:['n1'],autoScheduleDays:20});
  assert.ok(result.options.length>=2);
  const concentrated=result.options.find(item=>item.id==='concentrated');
  assert.ok(concentrated);
  assert.ok(concentrated.metrics.unresolvedCapacity>0);
  assert.equal(result.recommended.metrics.unresolvedCapacity,0);
  assert.ok(result.recommended.optimizerScore>concentrated.optimizerScore);
});

test('优化器去重完全相同的草案，避免展示伪多方案',()=>{
  const db=freeFixture();
  const result=optimizeSchedule(db,{
    startDate:'2026-08-17',needIds:['n1'],
    strategies:[
      {id:'a',label:'A',description:'',options:{maxChunk:50,maxPeoplePerNeed:4}},
      {id:'b',label:'B',description:'',options:{maxChunk:50,maxPeoplePerNeed:4}}
    ]
  });
  assert.equal(result.options.length,1);
  assert.equal(result.options[0].id,'a');
});

test('推荐方案可直接转换为原子 Application Service commands',()=>{
  const result=optimizeSchedule(freeFixture(),{objective:'balanced',startDate:'2026-08-17',needIds:['n1']});
  const commands=scheduleOptionCommands(result.recommended);
  assert.equal(commands.length,result.recommended.draft.proposals.length);
  assert.ok(commands.every(command=>command.type==='assignment.assign'));
  assert.ok(commands.every(command=>command.payload.needId==='n1'));
});
