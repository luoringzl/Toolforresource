import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDatabase } from '../src/core.mjs';
import { autoScheduleDraftCommands, generateAutoScheduleDraft, validateAutoScheduleDraft } from '../src/planning/auto-scheduler.mjs';

function fixture(){
  const db=emptyDatabase();
  db.projects.push(
    {id:'p1',name:'急项目',status:'视频制作中',priority:'P0 紧急',startDate:'2026-08-12',ddl:'2026-08-25'},
    {id:'p2',name:'普通项目',status:'制作中',priority:'P2 中',startDate:'2026-08-12',ddl:'2026-09-10'}
  );
  db.people.push(
    {id:'u1',name:'动画甲',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'高级'}]},
    {id:'u2',name:'动画乙',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'中级'}]},
    {id:'u3',name:'动画丙',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'初级'}]}
  );
  db.staffingNeeds.push(
    {id:'n1',projectId:'p1',role:'视频制作人员',stage:'视频',requiredCapacity:80,neededBy:'2026-08-12',status:'待安排'},
    {id:'n2',projectId:'p2',role:'视频制作人员',stage:'视频',requiredCapacity:40,neededBy:'2026-08-18',status:'待安排'}
  );
  return db;
}

test('自动排期草案可把大需求拆给多个人并保留 needId',()=>{
  const db=fixture();
  const draft=generateAutoScheduleDraft(db,{needIds:['n1'],startDate:'2026-08-12',days:30,maxChunk:50,minChunk:10,maxPeoplePerNeed:3});
  assert.equal(draft.requestedNeeds,1);
  assert.equal(draft.resolvedNeeds,1);
  assert.equal(draft.unresolved.length,0);
  assert.equal(draft.proposals.length,2);
  assert.equal(draft.proposals.reduce((sum,item)=>sum+item.allocation,0),80);
  assert.ok(draft.proposals.every(item=>item.needId==='n1'&&item.projectId==='p1'));
  assert.equal(new Set(draft.proposals.map(item=>item.personId)).size,2);
  assert.equal(draft.feasible,true);
});

test('自动排期按到岗日期优先处理更紧急需求',()=>{
  const db=fixture();
  const draft=generateAutoScheduleDraft(db,{startDate:'2026-08-12',days:30,maxChunk:50});
  assert.ok(draft.proposals.length>=2);
  assert.equal(draft.proposals[0].needId,'n1');
});

test('草案会预留前序建议产能，并把后续需求顺延到无冲突日期',()=>{
  const db=fixture();
  db.people=db.people.slice(0,1);
  db.staffingNeeds[0].requiredCapacity=60;
  db.staffingNeeds[1].requiredCapacity=60;
  const draft=generateAutoScheduleDraft(db,{startDate:'2026-08-12',days:30,maxChunk:60,minChunk:20,maxPeoplePerNeed:1});
  assert.equal(draft.proposals.length,2);
  assert.equal(draft.proposals[0].needId,'n1');
  assert.equal(draft.proposals[0].startDate,'2026-08-12');
  assert.equal(draft.proposals[0].meetsRequestedStart,true);
  assert.equal(draft.proposals[1].needId,'n2');
  assert.equal(draft.proposals[1].requestedStartDate,'2026-08-18');
  assert.equal(draft.proposals[1].startDate,'2026-08-26');
  assert.equal(draft.proposals[1].meetsRequestedStart,false);
  assert.equal(draft.proposals[1].delayDays,8);
  assert.match(draft.proposals[1].risks.join('；'),/晚于期望到岗 8 天/);
  assert.equal(draft.summary.delayedProposals,1);
  assert.equal(draft.summary.maxDelayDays,8);
  assert.equal(draft.conflicts.length,0);
});

test('无在岗候选时输出未解决缺口而不是生成危险分配',()=>{
  const db=fixture();
  db.people.forEach(person=>person.employmentStatus='离岗');
  const draft=generateAutoScheduleDraft(db,{needIds:['n1'],startDate:'2026-08-12',days:30});
  assert.equal(draft.proposals.length,0);
  assert.equal(draft.unresolved.length,1);
  assert.equal(draft.unresolved[0].remaining,80);
  assert.equal(draft.feasible,false);
});

test('草案命令可转换为 Application Service 可执行的 assignment.assign',()=>{
  const db=fixture();
  const draft=generateAutoScheduleDraft(db,{needIds:['n1'],startDate:'2026-08-12',days:30,maxChunk:50});
  const commands=autoScheduleDraftCommands(draft);
  assert.equal(commands.length,draft.proposals.length);
  assert.ok(commands.every(command=>command.type==='assignment.assign'));
  assert.equal(commands[0].payload.needId,'n1');
  assert.ok(commands[0].payload.startDate);
});

test('validateAutoScheduleDraft 可拒绝手工篡改后的冲突草案',()=>{
  const db=fixture();
  db.assignments.push({id:'busy',projectId:'p1',personId:'u1',role:'其它支持',stage:'其它',allocation:90,status:'进行中',startDate:'2026-08-12',endDate:'2026-08-20'});
  const draft={proposals:[{
    needId:'n1',projectId:'p1',personId:'u1',role:'视频制作人员',stage:'视频',allocation:50,startDate:'2026-08-12',endDate:'2026-08-18'
  }]};
  const validation=validateAutoScheduleDraft(db,draft,{startDate:'2026-08-12',days:30});
  assert.equal(validation.feasible,false);
  assert.ok(validation.conflicts.length>0);
});

test('validateAutoScheduleDraft 拒绝开始日期晚于项目结束日期的草案',()=>{
  const db=fixture();
  const draft={proposals:[{
    needId:'n1',projectId:'p1',personId:'u1',role:'视频制作人员',stage:'视频',allocation:20,startDate:'2026-08-30',endDate:'2026-08-25'
  }]};
  const validation=validateAutoScheduleDraft(db,draft,{startDate:'2026-08-12',days:30});
  assert.equal(validation.feasible,false);
  assert.ok(validation.invalid.some(item=>/开始日期晚于项目结束日期/.test(item.reason)));
});

test('单需求最大建议人数限制会留下明确未解决容量',()=>{
  const db=fixture();
  db.staffingNeeds[0].requiredCapacity=100;
  const draft=generateAutoScheduleDraft(db,{needIds:['n1'],startDate:'2026-08-12',days:30,maxChunk:30,minChunk:10,maxPeoplePerNeed:2});
  assert.equal(draft.proposals.length,2);
  assert.equal(draft.summary.allocatedCapacity,60);
  assert.equal(draft.unresolved[0].remaining,40);
  assert.match(draft.unresolved[0].reason,/最大建议人数/);
});
