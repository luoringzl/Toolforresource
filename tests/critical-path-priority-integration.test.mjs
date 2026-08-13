import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDatabase } from '../src/core.mjs';
import {
  buildCriticalPathNeedPriorityModel,
  generateCriticalPathPriorityDraft,
  optimizeCriticalPathPrioritySchedule
} from '../src/planning/critical-path-priority.mjs';

function productionFixture(){
  const db=emptyDatabase();
  db.projects.push(
    {id:'critical',name:'关键镜头项目',status:'制作中',priority:'P1 高',startDate:'2026-08-17',ddl:'2026-08-28',plannedDurationDays:10},
    {id:'normal',name:'普通插单项目',status:'制作中',priority:'P0 紧急',startDate:'2026-08-17',ddl:'2026-08-28',plannedDurationDays:4}
  );
  db.people.push(
    {id:'senior',name:'高级动画师',capacity:60,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'高级'}]},
    {id:'junior',name:'普通动画师',capacity:30,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'中级'}]}
  );
  db.staffingNeeds.push(
    {id:'nCritical',projectId:'critical',role:'视频制作人员',stage:'视频',requiredCapacity:80,neededBy:'2026-08-17',status:'待安排'},
    {id:'nNormal',projectId:'normal',role:'视频制作人员',stage:'视频',requiredCapacity:50,neededBy:'2026-08-17',status:'待安排'}
  );
  return db;
}

test('拆分多人分配时关键路径需求仍先占用可用产能',()=>{
  const result=generateCriticalPathPriorityDraft(productionFixture(),{
    startDate:'2026-08-17',autoScheduleDays:10,maxChunk:50,minChunk:10,step:10,maxPeoplePerNeed:3
  });
  assert.equal(result.ok,true);
  assert.equal(result.draft.priorityOrder[0].needId,'nCritical');
  const critical=result.draft.proposals.filter(item=>item.needId==='nCritical');
  const normal=result.draft.proposals.filter(item=>item.needId==='nNormal');
  assert.ok(critical.length>=1);
  assert.ok(critical.reduce((sum,item)=>sum+item.allocation,0)>=80,'关键需求应优先吃满 80% 缺口');
  assert.ok(normal.reduce((sum,item)=>sum+item.allocation,0)<=10,'剩余资源不足时普通项目只能得到极少或无产能');
});

test('优先级模型对相同输入稳定且不修改数据库',()=>{
  const db=productionFixture();
  const before=structuredClone(db);
  const first=buildCriticalPathNeedPriorityModel(db,{startDate:'2026-08-17'});
  const second=buildCriticalPathNeedPriorityModel(db,{startDate:'2026-08-17'});
  assert.deepEqual(first.priorities.map(item=>[item.need.id,item.priorityScore]),second.priorities.map(item=>[item.need.id,item.priorityScore]));
  assert.deepEqual(db,before);
});

test('不同多方案策略可以改变资源拆分方式，但不能改变关键需求先后顺序',()=>{
  const result=optimizeCriticalPathPrioritySchedule(productionFixture(),{
    objective:'balanced',startDate:'2026-08-17',autoScheduleDays:10
  });
  assert.equal(result.ok,true);
  assert.ok(result.options.length>=2);
  const signatures=new Set(result.options.map(option=>JSON.stringify(option.draft.proposals.map(item=>[item.needId,item.personId,item.allocation]))));
  assert.ok(signatures.size>=2,'不同策略应至少产生两个不同资源拆分方案');
  for(const option of result.options){
    assert.equal(option.draft.priorityOrder[0].needId,'nCritical');
    const firstNeed=option.draft.proposals[0]?.needId;
    assert.equal(firstNeed,'nCritical');
  }
});
