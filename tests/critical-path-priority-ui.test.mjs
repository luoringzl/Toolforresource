import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { emptyDatabase } from '../src/core.mjs';
import { buildCriticalPathNeedPriorityModel, CRITICAL_PATH_STAFFING_WEIGHTS } from '../src/planning/critical-path-priority.mjs';
import { renderCriticalPriorityQueue } from '../src/planning-center/critical-priority-ui.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tick=(ms=0)=>new Promise(resolve=>setTimeout(resolve,ms));

function scarcityFixture(){
  const db=emptyDatabase();
  db.projects.push(
    {id:'A',name:'关键长项目',status:'制作中',priority:'P2 中',startDate:'2026-08-17',ddl:'2026-08-28',plannedDurationDays:10},
    {id:'C',name:'普通紧急项目',status:'制作中',priority:'P0 紧急',startDate:'2026-08-17',ddl:'2026-08-28',plannedDurationDays:3}
  );
  db.people.push({
    id:'u1',name:'唯一动画师',capacity:50,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],
    skillProfiles:[{skill:'AI视频制作',level:'高级'}]
  });
  db.staffingNeeds.push(
    {id:'nA',projectId:'A',role:'视频制作人员',stage:'视频',requiredCapacity:50,neededBy:'2026-08-17',status:'待安排'},
    {id:'nC',projectId:'C',role:'视频制作人员',stage:'视频',requiredCapacity:50,neededBy:'2026-08-17',status:'待安排'}
  );
  return db;
}

function installGlobals(dom){
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.localStorage=dom.window.localStorage;
  globalThis.FormData=dom.window.FormData;globalThis.Blob=dom.window.Blob;globalThis.URL=dom.window.URL;
}
function clearGlobals(){
  delete globalThis.window;delete globalThis.document;delete globalThis.localStorage;delete globalThis.FormData;delete globalThis.Blob;delete globalThis.URL;
}

async function boot(role='admin'){
  const html=fs.readFileSync(path.join(root,'src/planning.html'),'utf8');
  const dom=new JSDOM(html,{url:'http://localhost/planning.html',pretendToBeVisual:true});
  installGlobals(dom);
  let data=scarcityFixture();
  let saves=0;
  dom.window.desktopAPI={
    async authStatus(){return {authenticated:true,user:{id:role,username:role,displayName:role==='admin'?'优先级管理员':'优先级查看者',role}};},
    async loadData(){return structuredClone(data);},
    async saveData(next){saves+=1;data=structuredClone(next);return {ok:true};},
    async syncPeopleAccounts(){return {ok:true};},
    async databaseDiagnostics(){return {exists:true,valid:true,sizeBytes:100,version:7,recoveryCount:0};},
    async listRecoveryPoints(){return [];},
    async clearRecoveryPoints(){return {ok:true,removed:0};}
  };
  const stamp=`priority-ui-${role}-${Date.now()}-${Math.random()}`;
  await import(`${pathToFileURL(path.join(root,'src/planning-center/planning-app.mjs')).href}?${stamp}-app`);
  await tick(12);
  const start=document.querySelector('#planning-start-date');
  start.value='2026-08-17';
  start.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  await tick(10);
  document.querySelector('[data-planning-view="auto"]').click();
  return {dom,getData:()=>data,getSaves:()=>saves};
}

test('关键路径优先分项之和严格等于总分',()=>{
  const model=buildCriticalPathNeedPriorityModel(scarcityFixture(),{startDate:'2026-08-17'});
  assert.equal(model.ok,true);
  assert.equal(model.priorities[0].need.id,'nA');
  const critical=model.priorities[0];
  const normal=model.priorities[1];
  assert.equal(critical.critical,true);
  assert.equal(critical.priorityBreakdown.reduce((sum,item)=>sum+item.score,0),critical.priorityScore);
  assert.equal(normal.priorityBreakdown.reduce((sum,item)=>sum+item.score,0),normal.priorityScore);
  assert.equal(critical.priorityBreakdown.find(item=>item.key==='criticalPath').score,CRITICAL_PATH_STAFFING_WEIGHTS.criticalPath);
  assert.equal(normal.priorityBreakdown.find(item=>item.key==='businessPriority').score,CRITICAL_PATH_STAFFING_WEIGHTS.businessPriority.P0);
});

test('优先队列渲染关键路径、排序原因和可展开分项',()=>{
  const model=buildCriticalPathNeedPriorityModel(scarcityFixture(),{startDate:'2026-08-17'});
  const html=renderCriticalPriorityQueue(model);
  assert.match(html,/关键长项目/);
  assert.match(html,/普通紧急项目/);
  assert.ok(html.indexOf('关键长项目')<html.indexOf('普通紧急项目'));
  assert.match(html,/查看分项/);
  assert.match(html,/关键路径 \+1000/);
  assert.match(html,/P0 紧急 \+400/);
  assert.match(html,/critical-tag/);
});

test('Planning Center 初始即显示关键路径优先队列，关键项目压过普通 P0',async()=>{
  const session=await boot('admin');
  try{
    const queue=document.querySelector('#planning-critical-priority');
    assert.ok(queue);
    assert.match(queue.textContent,/Ready 需求优先队列/);
    assert.ok(queue.textContent.indexOf('关键长项目')<queue.textContent.indexOf('普通紧急项目'));
    assert.match(queue.textContent,/关键路径/);
    assert.match(queue.textContent,/P0 紧急/);
    assert.ok(queue.querySelector('.priority-row.critical'));
  }finally{session.dom.window.close();clearGlobals();}
});

test('快速排期按关键路径顺序真实预留稀缺产能，只写入关键需求',async()=>{
  const session=await boot('admin');
  try{
    document.querySelector('#generate-auto-draft').click();
    await tick(12);
    assert.match(document.querySelector('#planning-message').textContent,/按关键路径优先队列生成/);
    const draft=document.querySelector('#planning-auto-draft').textContent;
    assert.match(draft,/关键长项目/);
    const apply=document.querySelector('#apply-auto-draft');
    assert.ok(apply);
    apply.click();
    await tick(0);
    document.querySelector('#planning-confirm-ok').click();
    await tick(20);
    assert.equal(session.getSaves(),1);
    const assignments=session.getData().assignments;
    assert.equal(assignments.filter(item=>item.needId==='nA').length,1);
    assert.equal(assignments.some(item=>item.needId==='nC'),false);
  }finally{session.dom.window.close();clearGlobals();}
});

test('多方案优化保持同一关键路径处理顺序并显示 V2.7 标签',async()=>{
  const session=await boot('admin');
  try{
    document.querySelector('#generate-optimized-options').click();
    await tick(15);
    assert.ok(document.querySelectorAll('.optimizer-option').length>0);
    assert.match(document.querySelector('#planning-message').textContent,/按优先队列只比较 2 条 ready 需求/);
    assert.match(document.querySelector('#planning-draft-label').textContent,/关键路径优先/);
    assert.match(document.querySelector('#planning-auto-draft').textContent,/关键长项目/);
  }finally{session.dom.window.close();clearGlobals();}
});

test('viewer 可查看优先队列并模拟，但不能应用真实排期',async()=>{
  const session=await boot('viewer');
  try{
    assert.match(document.querySelector('#planning-critical-priority').textContent,/关键长项目/);
    document.querySelector('#generate-auto-draft').click();
    await tick(10);
    assert.equal(document.querySelector('#apply-auto-draft'),null);
    assert.equal(session.getSaves(),0);
  }finally{session.dom.window.close();clearGlobals();}
});

test('Planning Center 标记 V2.7 并加载优先队列样式和根节点',()=>{
  const html=fs.readFileSync(path.join(root,'src/planning.html'),'utf8');
  assert.match(html,/资源规划 \/ V2\.7/);
  assert.match(html,/planning-center\/critical-priority\.css/);
  assert.match(html,/id="planning-critical-priority"/);
  assert.match(html,/关键路径优先自动排期/);
});
