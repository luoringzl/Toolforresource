import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDatabase } from '../src/core.mjs';
import { buildProjectGanttModel, buildResourceGanttModel, ganttViewport } from '../src/planning/gantt-model.mjs';
import { recommendAssignmentCandidates, recommendForStaffingNeed, scoreAssignmentCandidate } from '../src/planning/recommendation-engine.mjs';

function fixture(){
  const db=emptyDatabase();
  db.projects.push({
    id:'p1',name:'影片A',status:'视频制作中',startDate:'2026-08-10',ddl:'2026-08-31',
    assetCompletionDate:'2026-08-14',videoCompletionDate:'2026-08-28'
  });
  db.people.push(
    {id:'busy',name:'忙碌动画师',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'高级'}]},
    {id:'free',name:'空闲动画师',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'中级'}]},
    {id:'skill',name:'技能候选',capacity:100,employmentStatus:'在岗',position:'其它',positions:['其它'],skillProfiles:[{skill:'AI视频制作',level:'高级'}]}
  );
  db.assignments.push({id:'a1',projectId:'p1',personId:'busy',role:'视频制作人员',stage:'视频',allocation:70,status:'进行中',startDate:'2026-08-12',endDate:'2026-08-20'});
  db.staffingNeeds.push({id:'n1',projectId:'p1',role:'视频制作人员',stage:'视频',requiredCapacity:50,neededBy:'2026-08-12',status:'待安排'});
  return db;
}

test('Resource Gantt 输出人员行、任务条和逐日产能',()=>{
  const db=fixture();
  const model=buildResourceGanttModel(db,{startDate:'2026-08-12',days:14});
  assert.equal(model.kind,'resource');
  assert.equal(model.columns.length,14);
  const busy=model.rows.find(row=>row.id==='busy');
  assert.equal(busy.bars.length,1);
  assert.equal(busy.bars[0].startIndex,0);
  assert.equal(busy.bars[0].endDate,'2026-08-20');
  assert.equal(busy.capacity[0].usage,70);
});

test('Project Gantt 输出项目条、人员分工和里程碑',()=>{
  const db=fixture();
  const model=buildProjectGanttModel(db,{startDate:'2026-08-10',days:25});
  assert.equal(model.kind,'project');
  assert.equal(model.rows.length,1);
  const row=model.rows[0];
  assert.equal(row.assignments.length,1);
  assert.ok(row.milestones.some(item=>item.type==='asset'&&item.date==='2026-08-14'));
  assert.ok(row.milestones.some(item=>item.type==='video'&&item.date==='2026-08-28'));
  assert.ok(row.milestones.some(item=>item.type==='ddl'&&item.date==='2026-08-31'));
});

test('Gantt viewport 只保留可见任务并转换局部坐标',()=>{
  const db=fixture();
  const model=buildResourceGanttModel(db,{startDate:'2026-08-12',days:20});
  const view=ganttViewport(model,{offset:5,length:7});
  assert.equal(view.columns[0],'2026-08-17');
  const bar=view.rows.find(row=>row.id==='busy').bars[0];
  assert.equal(bar.viewportStart,0);
  assert.equal(bar.viewportEnd,3);
});

test('自动推荐优先职位匹配且按期无冲突的人员',()=>{
  const db=fixture();
  const candidates=recommendAssignmentCandidates(db,{projectId:'p1',role:'视频制作人员',stage:'视频',allocation:50,startDate:'2026-08-12',endDate:'2026-08-18'},{startDate:'2026-08-12',days:20});
  assert.equal(candidates[0].person.id,'free');
  assert.equal(candidates[0].rank,1);
  assert.equal(candidates[0].positionMatch,true);
  assert.equal(candidates[0].feasible,true);
  assert.ok(candidates[0].reasons.includes('职位直接匹配'));
  assert.ok(candidates[0].reasons.includes('可按期满足所需产能'));
  assert.ok(candidates.find(item=>item.person.id==='busy').score<candidates[0].score);
});

test('技能匹配可以成为候选，但低于无冲突的直接职位匹配',()=>{
  const db=fixture();
  const candidates=recommendAssignmentCandidates(db,{projectId:'p1',role:'视频制作人员',allocation:30,startDate:'2026-08-12',endDate:'2026-08-15'},{startDate:'2026-08-12',days:10});
  const free=candidates.find(item=>item.person.id==='free');
  const skill=candidates.find(item=>item.person.id==='skill');
  assert.equal(skill.skillMatch,true);
  assert.equal(skill.positionMatch,false);
  assert.ok(free.score>skill.score);
});

test('单人评分提供风险与最早可用日期解释',()=>{
  const db=fixture();
  const busy=db.people.find(item=>item.id==='busy');
  const result=scoreAssignmentCandidate(db,busy,{projectId:'p1',role:'视频制作人员',allocation:50,startDate:'2026-08-12',endDate:'2026-08-18'},{startDate:'2026-08-12',days:20});
  assert.equal(result.firstAvailableDate,'2026-08-21');
  assert.ok(result.reasons.some(reason=>reason.includes('2026-08-21')));
});

test('用人需求可直接生成解释型候选列表',()=>{
  const db=fixture();
  const result=recommendForStaffingNeed(db,'n1',{startDate:'2026-08-12',days:20,limit:2});
  assert.equal(result.ok,true);
  assert.equal(result.gap,50);
  assert.equal(result.candidates.length,2);
  assert.equal(result.candidates[0].person.id,'free');
});
