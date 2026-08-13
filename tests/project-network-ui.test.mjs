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
    {id:'A',name:'A 概念与前期',status:'制作中',startDate:'2026-08-17',ddl:'2026-09-30',plannedDurationDays:3},
    {id:'B',name:'B 资产制作',status:'待启动',startDate:'2026-08-17',ddl:'2026-09-30',plannedDurationDays:4,dependencies:[{predecessorId:'A',type:'FS',lagDays:0}]},
    {id:'C',name:'C 声音准备',status:'待启动',startDate:'2026-08-17',ddl:'2026-09-30',plannedDurationDays:2,dependencies:[{predecessorId:'A',type:'FS',lagDays:0}]},
    {id:'D',name:'D 最终合成',status:'待启动',startDate:'2026-08-17',ddl:'2026-08-26',plannedDurationDays:2,dependencies:[{predecessorId:'B',type:'FS',lagDays:0},{predecessorId:'C',type:'FS',lagDays:0}]}
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
    async authStatus(){return {authenticated:true,user:{id:role,username:role,displayName:role==='admin'?'网络管理员':'网络查看者',role}};},
    async loadData(){return structuredClone(data);},
    async saveData(next){saves+=1;data=structuredClone(next);return {ok:true};},
    async syncPeopleAccounts(){return {ok:true};},
    async databaseDiagnostics(){return {exists:true,valid:true,sizeBytes:100,version:7,recoveryCount:0};},
    async listRecoveryPoints(){return [];},
    async clearRecoveryPoints(){return {ok:true,removed:0};}
  };
  const stamp=`network-${role}-${Date.now()}-${Math.random()}`;
  await import(`${pathToFileURL(path.join(root,'src/planning-center/planning-app.mjs')).href}?${stamp}-app`);
  await import(`${pathToFileURL(path.join(root,'src/planning-center/history-bootstrap.mjs')).href}?${stamp}-history`);
  await import(`${pathToFileURL(path.join(root,'src/planning-center/project-network-bootstrap.mjs')).href}?${stamp}-network`);
  await tick(15);
  document.querySelector('[data-project-network]').click();
  await tick(20);
  return {dom,getData:()=>data,getSaves:()=>saves};
}

test('项目网络页面显示关键路径、浮动时间和 DDL 风险',async()=>{
  const session=await boot('admin');
  try{
    assert.ok(document.querySelector('#planning-network').classList.contains('active'));
    assert.equal(document.querySelector('#planning-title').textContent,'项目网络 / 关键路径');
    const pathText=document.querySelector('#project-critical-path').textContent;
    assert.match(pathText,/A 概念与前期/);
    assert.match(pathText,/B 资产制作/);
    assert.match(pathText,/D 最终合成/);
    assert.doesNotMatch(pathText,/C 声音准备/);
    const table=document.querySelector('#project-network-table').textContent;
    assert.match(table,/C 声音准备/);
    assert.match(table,/2工作日/,'C 应显示 2 个工作日浮动');
    assert.match(table,/晚 1 天/,'D 应显示 DDL 风险');
    assert.match(document.querySelector('#project-network-summary').textContent,/关键项目3/);
  }finally{session.dom.window.close();clearGlobals();}
});

test('循环依赖在 UI 写入前被拒绝且不产生数据库保存',async()=>{
  const session=await boot('admin');
  try{
    const form=document.querySelector('#dependency-form');
    form.elements.projectId.value='A';
    form.elements.predecessorId.value='D';
    form.elements.type.value='FS';
    form.dispatchEvent(new session.dom.window.Event('submit',{bubbles:true,cancelable:true}));
    await tick(15);
    assert.equal(session.getSaves(),0);
    assert.match(document.querySelector('#planning-message').textContent,/循环/);
    assert.equal(session.getData().projects.find(item=>item.id==='A').dependencies,undefined);
  }finally{session.dom.window.close();clearGlobals();}
});

test('添加里程碑作为可撤销项目事务写入，并可通过 Undo 恢复',async()=>{
  const session=await boot('admin');
  try{
    const form=document.querySelector('#milestone-form');
    form.elements.projectId.value='B';
    form.elements.label.value='客户资产中审';
    form.elements.date.value='2026-08-24';
    form.elements.type.value='review';
    form.elements.status.value='待确认';
    form.dispatchEvent(new session.dom.window.Event('submit',{bubbles:true,cancelable:true}));
    await tick(25);
    assert.equal(session.getSaves(),1);
    assert.equal(session.getData().projects.find(item=>item.id==='B').milestones.length,1);
    assert.match(document.querySelector('#project-milestone-list').textContent,/客户资产中审/);
    const undo=document.querySelector('#planning-undo');
    assert.equal(undo.disabled,false);
    assert.match(undo.title,/添加项目里程碑/);
    undo.click();
    await tick(0);
    document.querySelector('#history-confirm-ok').click();
    await tick(30);
    assert.equal(session.getSaves(),2);
    assert.equal(session.getData().projects.find(item=>item.id==='B').milestones,undefined);
    assert.doesNotMatch(document.querySelector('#project-milestone-list').textContent,/客户资产中审/);
  }finally{session.dom.window.close();clearGlobals();}
});

test('移除依赖通过可审计项目事务保存',async()=>{
  const session=await boot('admin');
  try{
    const button=[...document.querySelectorAll('[data-remove-dependency]')].find(item=>item.dataset.removeDependency==='D'&&item.dataset.predecessorId==='C');
    assert.ok(button);
    button.click();
    await tick(25);
    assert.equal(session.getSaves(),1);
    const d=session.getData().projects.find(item=>item.id==='D');
    assert.equal(d.dependencies.length,1);
    assert.equal(d.dependencies[0].predecessorId,'B');
    assert.match(document.querySelector('#planning-undo').title,/移除项目依赖/);
  }finally{session.dom.window.close();clearGlobals();}
});

test('只读账号可查看关键路径，但依赖/里程碑写入按钮禁用',async()=>{
  const session=await boot('viewer');
  try{
    assert.ok(document.querySelector('#project-critical-path .critical-path'));
    assert.equal(document.querySelector('#dependency-form button[type="submit"]').disabled,true);
    assert.equal(document.querySelector('#milestone-form button[type="submit"]').disabled,true);
    assert.equal(document.querySelector('[data-remove-dependency]'),null);
    assert.equal(session.getSaves(),0);
  }finally{session.dom.window.close();clearGlobals();}
});

test('Planning Center 加载项目网络导航、样式和独立 bootstrap',()=>{
  const html=fs.readFileSync(path.join(root,'src/planning.html'),'utf8');
  assert.match(html,/data-project-network/);
  assert.match(html,/id="planning-network"/);
  assert.match(html,/planning-center\/project-network\.css/);
  assert.match(html,/planning-center\/project-network-bootstrap\.mjs/);
});
