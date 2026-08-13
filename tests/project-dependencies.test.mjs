import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDatabase } from '../src/core.mjs';
import {
  addProjectDependency,
  calculateProjectCriticalPath,
  dependencyReadiness,
  normalizeProjectDependencies,
  normalizeProjectMilestones,
  removeProjectDependency,
  upsertProjectMilestone,
  validateProjectDependencyGraph
} from '../src/planning/project-dependencies.mjs';

function networkFixture(){
  const db=emptyDatabase();
  db.projects.push(
    {id:'A',name:'A 概念与前期',status:'制作中',startDate:'2026-08-17',ddl:'2026-09-30',plannedDurationDays:3},
    {id:'B',name:'B 资产制作',status:'待启动',startDate:'2026-08-17',ddl:'2026-09-30',plannedDurationDays:4,dependencies:[{predecessorId:'A',type:'FS',lagDays:0}]},
    {id:'C',name:'C 声音准备',status:'待启动',startDate:'2026-08-17',ddl:'2026-09-30',plannedDurationDays:2,dependencies:[{predecessorId:'A',type:'finish-to-start',lagDays:0}]},
    {id:'D',name:'D 最终合成',status:'待启动',startDate:'2026-08-17',ddl:'2026-08-26',plannedDurationDays:2,dependencies:[
      {predecessorId:'B',type:'FS',lagDays:0},
      {predecessorId:'C',type:'FS',lagDays:0}
    ]}
  );
  return db;
}

test('依赖规范化支持类型别名、lag 和去重',()=>{
  const project={dependencies:[
    {projectId:'A',type:'finish-to-start',lag:1,note:'前置'},
    {predecessorId:'A',type:'FS',lagDays:1,note:'重复'},
    {predecessorId:'B',type:'start-to-start',lagDays:-1}
  ]};
  assert.deepEqual(normalizeProjectDependencies(project),[
    {predecessorId:'A',type:'FS',lagDays:1,note:'前置'},
    {predecessorId:'B',type:'SS',lagDays:-1,note:''}
  ]);
});

test('依赖图输出稳定拓扑顺序且无循环',()=>{
  const validation=validateProjectDependencyGraph(networkFixture());
  assert.equal(validation.ok,true);
  assert.equal(validation.edges.length,4);
  assert.equal(validation.order[0],'A');
  assert.equal(validation.order.at(-1),'D');
  assert.ok(validation.order.indexOf('B')<validation.order.indexOf('D'));
  assert.ok(validation.order.indexOf('C')<validation.order.indexOf('D'));
});

test('4 项目网络计算 A → B → D 为关键路径，C 有 2 个工作日浮动',()=>{
  const result=calculateProjectCriticalPath(networkFixture(),{startDate:'2026-08-17'});
  assert.equal(result.ok,true);
  assert.deepEqual(result.criticalPathIds,['A','B','D']);
  assert.equal(result.networkDurationDays,9);
  assert.equal(result.networkStartDate,'2026-08-17');
  assert.equal(result.networkFinishDate,'2026-08-27');
  const a=result.nodes.find(item=>item.project.id==='A');
  const b=result.nodes.find(item=>item.project.id==='B');
  const c=result.nodes.find(item=>item.project.id==='C');
  const d=result.nodes.find(item=>item.project.id==='D');
  assert.equal(a.plannedFinishDate,'2026-08-19');
  assert.equal(b.plannedStartDate,'2026-08-20');
  assert.equal(b.plannedFinishDate,'2026-08-25');
  assert.equal(c.plannedFinishDate,'2026-08-21');
  assert.equal(c.totalFloatDays,2);
  assert.equal(c.critical,false);
  assert.equal(d.plannedStartDate,'2026-08-26');
  assert.equal(d.plannedFinishDate,'2026-08-27');
  assert.equal(d.lateByWorkingDays,1);
  assert.equal(result.deadlineRisks.length,1);
  assert.equal(result.deadlineRisks[0].project.id,'D');
});

test('SS 与 FF 依赖正确转换为最早开始偏移',()=>{
  const db=emptyDatabase();
  db.projects.push(
    {id:'A',name:'A',status:'制作中',startDate:'2026-08-17',plannedDurationDays:3},
    {id:'E',name:'E',status:'待启动',startDate:'2026-08-17',plannedDurationDays:2,dependencies:[{predecessorId:'A',type:'SS',lagDays:1}]},
    {id:'F',name:'F',status:'待启动',startDate:'2026-08-17',plannedDurationDays:2,dependencies:[{predecessorId:'A',type:'FF',lagDays:1}]}
  );
  const result=calculateProjectCriticalPath(db,{startDate:'2026-08-17'});
  assert.equal(result.nodes.find(item=>item.project.id==='E').earliestStartOffset,1);
  assert.equal(result.nodes.find(item=>item.project.id==='E').plannedStartDate,'2026-08-18');
  assert.equal(result.nodes.find(item=>item.project.id==='F').earliestStartOffset,2);
  assert.equal(result.nodes.find(item=>item.project.id==='F').plannedStartDate,'2026-08-19');
});

test('缺失前置项目、自依赖和循环依赖均被拒绝',()=>{
  const missing=emptyDatabase();
  missing.projects.push({id:'A',name:'A',dependencies:[{predecessorId:'missing',type:'FS'}]});
  let validation=validateProjectDependencyGraph(missing);
  assert.equal(validation.ok,false);
  assert.equal(validation.errors[0].code,'DEPENDENCY_PREDECESSOR_NOT_FOUND');

  const self=emptyDatabase();
  self.projects.push({id:'A',name:'A',dependencies:[{predecessorId:'A',type:'FS'}]});
  validation=validateProjectDependencyGraph(self);
  assert.equal(validation.ok,false);
  assert.ok(validation.errors.some(item=>item.code==='DEPENDENCY_SELF_REFERENCE'));

  const cycle=emptyDatabase();
  cycle.projects.push(
    {id:'A',name:'A',dependencies:[{predecessorId:'C',type:'FS'}]},
    {id:'B',name:'B',dependencies:[{predecessorId:'A',type:'FS'}]},
    {id:'C',name:'C',dependencies:[{predecessorId:'B',type:'FS'}]}
  );
  validation=validateProjectDependencyGraph(cycle);
  assert.equal(validation.ok,false);
  assert.ok(validation.errors.some(item=>item.code==='DEPENDENCY_CYCLE'));
  assert.ok(validation.cycles.length>0);
  assert.equal(calculateProjectCriticalPath(cycle).ok,false);
});

test('addProjectDependency 在写入前验证循环，失败不修改原数据库',()=>{
  let db=emptyDatabase();
  db.projects.push({id:'A',name:'A'},{id:'B',name:'B'},{id:'C',name:'C'});
  let result=addProjectDependency(db,{projectId:'B',predecessorId:'A'});
  assert.equal(result.ok,true);db=result.database;
  result=addProjectDependency(db,{projectId:'C',predecessorId:'B'});
  assert.equal(result.ok,true);db=result.database;
  const before=structuredClone(db);
  result=addProjectDependency(db,{projectId:'A',predecessorId:'C'});
  assert.equal(result.ok,false);
  assert.equal(result.code,'DEPENDENCY_CYCLE');
  assert.deepEqual(db,before);
});

test('removeProjectDependency 可按前置项目和类型移除',()=>{
  const db=networkFixture();
  const result=removeProjectDependency(db,{projectId:'D',predecessorId:'C',type:'FS'});
  assert.equal(result.ok,true);
  assert.equal(normalizeProjectDependencies(result.database.projects.find(item=>item.id==='D')).length,1);
  assert.equal(normalizeProjectDependencies(db.projects.find(item=>item.id==='D')).length,2,'原数据库保持不变');
});

test('里程碑同时包含内置资产/视频/DDL 与自定义节点并按日期排序',()=>{
  const project={
    assetCompletionDate:'2026-08-20',videoCompletionDate:'2026-08-28',ddl:'2026-08-31',
    milestones:[{id:'m1',label:'客户中审',date:'2026-08-25',type:'review'}]
  };
  const milestones=normalizeProjectMilestones(project);
  assert.deepEqual(milestones.map(item=>item.label),['资产完成','客户中审','视频完成','DDL']);
  assert.equal(milestones.find(item=>item.id==='m1').source,'custom');
  assert.equal(milestones.find(item=>item.type==='ddl').source,'builtin');
});

test('upsertProjectMilestone 校验日期并保持原数据库不可变',()=>{
  const db=emptyDatabase();db.projects.push({id:'A',name:'A'});
  const good=upsertProjectMilestone(db,{projectId:'A',id:'m1',label:'内部审片',date:'2026-08-28',type:'review'});
  assert.equal(good.ok,true);
  assert.equal(good.database.projects[0].milestones.length,1);
  assert.equal(db.projects[0].milestones,undefined);
  const bad=upsertProjectMilestone(db,{projectId:'A',label:'错误日期',date:'2026-02-30'});
  assert.equal(bad.ok,false);
  assert.match(bad.error,/日期无效/);
});

test('FS readiness 要求前置项目完成；SS readiness 只要求前置项目已启动',()=>{
  const db=emptyDatabase();
  db.projects.push(
    {id:'A',name:'A',status:'制作中'},
    {id:'B',name:'B',status:'待启动',dependencies:[{predecessorId:'A',type:'FS'}]},
    {id:'C',name:'C',status:'待启动',dependencies:[{predecessorId:'A',type:'SS'}]}
  );
  assert.equal(dependencyReadiness(db,'B').ready,false);
  assert.equal(dependencyReadiness(db,'C').ready,true);
  db.projects.find(item=>item.id==='A').status='已完成';
  assert.equal(dependencyReadiness(db,'B').ready,true);
});

test('没有显式 plannedDurationDays 时按工作日 startDate → DDL 推导持续时间',()=>{
  const db=emptyDatabase();
  db.projects.push({id:'A',name:'A',status:'制作中',startDate:'2026-08-17',ddl:'2026-08-21'});
  const result=calculateProjectCriticalPath(db,{startDate:'2026-08-17'});
  assert.equal(result.nodes[0].durationDays,5);
  assert.equal(result.networkDurationDays,5);
  assert.equal(result.networkFinishDate,'2026-08-21');
});
