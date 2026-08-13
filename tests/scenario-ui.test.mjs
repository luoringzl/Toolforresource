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
    {id:'p1',name:'主项目',status:'制作中',priority:'P0 紧急',startDate:'2026-08-17',ddl:'2026-09-20'},
    {id:'p2',name:'支援项目',status:'制作中',priority:'P2 中',startDate:'2026-08-17',ddl:'2026-09-10'}
  );
  db.people.push(
    {id:'u1',name:'动画甲',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'高级'}]},
    {id:'u2',name:'动画乙',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'高级'}]}
  );
  db.assignments.push(
    {id:'a1',projectId:'p1',personId:'u1',role:'其它支持',stage:'其它',allocation:80,status:'进行中',startDate:'2026-08-17',endDate:'2026-09-20'},
    {id:'a2',projectId:'p2',personId:'u1',role:'其它支持',stage:'其它',allocation:40,status:'进行中',startDate:'2026-08-17',endDate:'2026-09-10'}
  );
  db.staffingNeeds.push({id:'n1',projectId:'p1',role:'视频制作人员',stage:'视频',requiredCapacity:50,neededBy:'2026-08-17',status:'待安排'});
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
    async authStatus(){return {authenticated:true,user:{id:role,username:role,displayName:role==='admin'?'沙盘管理员':'沙盘查看者',role}};},
    async loadData(){return structuredClone(data);},
    async saveData(next){saves+=1;data=structuredClone(next);return {ok:true};},
    async syncPeopleAccounts(){return {ok:true};},
    async databaseDiagnostics(){return {exists:true,valid:true,sizeBytes:100,version:7,recoveryCount:0};},
    async listRecoveryPoints(){return [];},
    async clearRecoveryPoints(){return {ok:true,removed:0};}
  };
  await import(`${pathToFileURL(path.join(root,'src/planning-center/planning-app.mjs')).href}?scenario-ui=${role}-${Date.now()}-${Math.random()}`);
  await tick(8);
  const start=document.querySelector('#planning-start-date');
  start.value='2026-08-17';
  start.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  await tick(6);
  document.querySelector('[data-planning-view="scenario"]').click();
  return {dom,getData:()=>data,getSaves:()=>saves};
}

function addTransferScenario(dom){
  const kind=document.querySelector('#scenario-kind');
  kind.value='transfer';
  kind.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  const form=document.querySelector('#scenario-builder');
  form.elements.transferAssignmentId.value='a2';
  form.elements.transferTargetPersonId.value='u2';
  form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
}

function addFillScenario(dom){
  const kind=document.querySelector('#scenario-kind');
  kind.value='fill';
  kind.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  const form=document.querySelector('#scenario-builder');
  form.elements.fillNeedId.value='n1';
  form.elements.fillPersonId.value='u2';
  form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
}

test('管理员可加入多个 What-if 情景、比较 Baseline 并原子应用选中情景',async()=>{
  const session=await boot('admin');
  try{
    assert.ok(document.querySelector('#scenario-builder'));
    addTransferScenario(session.dom);
    await tick(4);
    addFillScenario(session.dom);
    await tick(4);
    assert.equal(document.querySelectorAll('.scenario-queue article').length,2);

    document.querySelector('#scenario-objective').value='lowConflict';
    document.querySelector('#compare-scenarios').click();
    await tick(10);
    assert.match(document.querySelector('.scenario-baseline').textContent,/Baseline/);
    const cards=[...document.querySelectorAll('.scenario-result:not(.invalid)')];
    assert.equal(cards.length,2);
    const recommended=cards.find(card=>card.classList.contains('recommended'));
    assert.ok(recommended);
    assert.match(recommended.textContent,/转给 动画乙|转给动画乙|支援项目/);
    assert.match(recommended.textContent,/冲突人员-1|冲突日-/);

    const apply=recommended.querySelector('[data-apply-scenario]');
    assert.ok(apply);
    apply.click();
    await tick(0);
    assert.ok(document.querySelector('#planning-confirm-ok'));
    document.querySelector('#planning-confirm-ok').click();
    await tick(12);
    assert.equal(session.getSaves(),1,'情景应用必须只执行一次批量保存');
    const data=session.getData();
    assert.equal(data.assignments.some(item=>item.projectId==='p2'&&item.personId==='u1'&&!['已结束','已取消'].includes(item.status)),false);
    assert.equal(data.assignments.some(item=>item.projectId==='p2'&&item.personId==='u2'),true);
    assert.equal(document.querySelectorAll('.scenario-queue article').length,0,'真实数据变化后应清空旧模拟情景');
  }finally{session.dom.window.close();clearGlobals();}
});

test('只读账号可以建立和比较情景，但没有任何应用按钮',async()=>{
  const session=await boot('viewer');
  try{
    addTransferScenario(session.dom);
    await tick(4);
    document.querySelector('#compare-scenarios').click();
    await tick(10);
    assert.ok(document.querySelector('.scenario-result'));
    assert.equal(document.querySelector('[data-apply-scenario]'),null);
    assert.equal(session.getSaves(),0);
  }finally{session.dom.window.close();clearGlobals();}
});

test('Planning Center 加载情景沙盘导航与独立样式',()=>{
  const html=fs.readFileSync(path.join(root,'src/planning.html'),'utf8');
  assert.match(html,/data-planning-view="scenario"/);
  assert.match(html,/planning-center\/scenario\.css/);
  assert.match(html,/What-if 情景沙盘/);
});
