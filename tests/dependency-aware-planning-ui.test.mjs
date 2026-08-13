import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { emptyDatabase } from '../src/core.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tick=(ms=0)=>new Promise(resolve=>setTimeout(resolve,ms));

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
  let data=fixture();
  let saves=0;
  dom.window.desktopAPI={
    async authStatus(){return {authenticated:true,user:{id:role,username:role,displayName:role==='admin'?'依赖管理员':'依赖查看者',role}};},
    async loadData(){return structuredClone(data);},
    async saveData(next){saves+=1;data=structuredClone(next);return {ok:true};},
    async syncPeopleAccounts(){return {ok:true};},
    async databaseDiagnostics(){return {exists:true,valid:true,sizeBytes:100,version:7,recoveryCount:0};},
    async listRecoveryPoints(){return [];},
    async clearRecoveryPoints(){return {ok:true,removed:0};}
  };
  const stamp=`dep-aware-${role}-${Date.now()}-${Math.random()}`;
  await import(`${pathToFileURL(path.join(root,'src/planning-center/planning-app.mjs')).href}?${stamp}-app`);
  if(role==='admin')await import(`${pathToFileURL(path.join(root,'src/planning-center/history-bootstrap.mjs')).href}?${stamp}-history`);
  await tick(12);
  const start=document.querySelector('#planning-start-date');
  start.value='2026-08-17';
  start.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  await tick(10);
  document.querySelector('[data-planning-view="auto"]').click();
  return {dom,getData:()=>data,getSaves:()=>saves};
}

test('自动排期页立即显示 ready / blocked 门控和前置项目',async()=>{
  const session=await boot('admin');
  try{
    const gate=document.querySelector('#planning-dependency-gate');
    assert.match(gate.textContent,/开放需求2/);
    assert.match(gate.textContent,/现在可排1/);
    assert.match(gate.textContent,/前置阻塞1/);
    assert.match(gate.textContent,/阻塞项目 · 视频制作人员/);
    assert.match(gate.textContent,/前置项目 · FS · 制作中/);
    assert.match(gate.textContent,/不会进入任何可应用自动排期方案/);
  }finally{session.dom.window.close();clearGlobals();}
});

test('快速单方案只生成 ready 项目分工，真实应用也不会写入 blocked 项目',async()=>{
  const session=await boot('admin');
  try{
    document.querySelector('#generate-auto-draft').click();
    await tick(12);
    const draft=document.querySelector('#planning-auto-draft').textContent;
    assert.match(draft,/可排项目/);
    assert.doesNotMatch(draft,/阻塞项目/);
    const apply=document.querySelector('#apply-auto-draft');
    assert.ok(apply);
    apply.click();
    await tick(0);
    document.querySelector('#planning-confirm-ok').click();
    await tick(20);
    assert.equal(session.getSaves(),1);
    const assignments=session.getData().assignments;
    assert.ok(assignments.some(item=>item.needId==='nC'&&item.projectId==='C'));
    assert.equal(assignments.some(item=>item.needId==='nB'||item.projectId==='B'),false);
    assert.match(document.querySelector('#planning-undo').title,/依赖感知快速单方案/);
  }finally{session.dom.window.close();clearGlobals();}
});

test('多方案优化只比较 ready 需求，推荐草案不出现 blocked 项目',async()=>{
  const session=await boot('admin');
  try{
    document.querySelector('#generate-optimized-options').click();
    await tick(15);
    assert.ok(document.querySelectorAll('.optimizer-option').length>0);
    assert.match(document.querySelector('#planning-message').textContent,/只比较 1 条 ready 需求/);
    assert.match(document.querySelector('#planning-draft-label').textContent,/依赖感知推荐/);
    const draft=document.querySelector('#planning-auto-draft').textContent;
    assert.match(draft,/可排项目/);
    assert.doesNotMatch(draft,/阻塞项目/);
  }finally{session.dom.window.close();clearGlobals();}
});

test('viewer 可查看 blocked 原因并生成模拟方案，但没有真实应用按钮',async()=>{
  const session=await boot('viewer');
  try{
    assert.match(document.querySelector('#planning-dependency-gate').textContent,/前置阻塞1/);
    document.querySelector('#generate-auto-draft').click();
    await tick(10);
    assert.match(document.querySelector('#planning-auto-draft').textContent,/可排项目/);
    assert.equal(document.querySelector('#apply-auto-draft'),null);
    assert.equal(session.getSaves(),0);
  }finally{session.dom.window.close();clearGlobals();}
});

test('Planning Center 加载 Dependency Gate 样式和专用根节点',()=>{
  const html=fs.readFileSync(path.join(root,'src/planning.html'),'utf8');
  assert.match(html,/planning-center\/dependency-gate\.css/);
  assert.match(html,/id="planning-dependency-gate"/);
  assert.match(html,/依赖感知自动排期/);
});
