import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { emptyDatabase } from '../src/core.mjs';
import { createCommandHistory } from '../src/services/command-history.mjs';
import { getActiveApplicationService, registerApplicationService, subscribeApplicationRuntime } from '../src/services/application-runtime.mjs';
import { renderAuditTrail, renderHistoryButtons } from '../src/planning-center/history-ui.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tick=(ms=0)=>new Promise(resolve=>setTimeout(resolve,ms));

function fixture(){
  const db=emptyDatabase();
  db.projects.push({id:'p1',name:'可撤销项目',status:'制作中',priority:'P1 高',startDate:'2026-08-17',ddl:'2026-09-30'});
  db.people.push({id:'u1',name:'动画甲',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'高级'}]});
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
  let syncs=0;
  dom.window.desktopAPI={
    async authStatus(){return {authenticated:true,user:{id:role,username:role,displayName:role==='admin'?'历史管理员':'历史查看者',role}};},
    async loadData(){return structuredClone(data);},
    async saveData(next){saves+=1;data=structuredClone(next);return {ok:true};},
    async syncPeopleAccounts(){syncs+=1;return {ok:true};},
    async databaseDiagnostics(){return {exists:true,valid:true,sizeBytes:100,version:7,recoveryCount:0};},
    async listRecoveryPoints(){return [];},
    async clearRecoveryPoints(){return {ok:true,removed:0};}
  };
  await import(`${pathToFileURL(path.join(root,'src/planning-center/planning-app.mjs')).href}?history-app=${role}-${Date.now()}-${Math.random()}`);
  await import(`${pathToFileURL(path.join(root,'src/planning-center/history-bootstrap.mjs')).href}?history-ui=${role}-${Date.now()}-${Math.random()}`);
  await tick(10);
  const start=document.querySelector('#planning-start-date');
  start.value='2026-08-17';
  start.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  await tick(8);
  return {dom,getData:()=>data,getSaves:()=>saves,getSyncs:()=>syncs};
}

test('批量事务默认标签使用业务语言',()=>{
  const history=createCommandHistory({idFactory:()=> 'tx-label',now:()=>new Date('2026-08-17T00:00:00Z')});
  const db=emptyDatabase();
  const assigns=history.createTransaction({before:db,after:db,commands:[
    {type:'assignment.assign'},{type:'assignment.assign'}
  ]});
  assert.equal(assigns.label,'批量安排项目分工（2 条）');
  const transfer=history.createTransaction({before:db,after:db,commands:[
    {type:'assignment.remove'},{type:'assignment.assign'}
  ]});
  assert.equal(transfer.label,'调整项目分工（2 条）');
});

test('Application Runtime 可注册同一个活动服务并广播 service-ready',()=>{
  const events=[];
  const unsubscribe=subscribeApplicationRuntime(event=>events.push(event));
  const service={historyStatus(){return {canUndo:false};}};
  registerApplicationService(service);
  assert.equal(getActiveApplicationService(),service);
  assert.equal(events.at(-1).type,'service-ready');
  assert.equal(events.at(-1).service,service);
  unsubscribe();
});

test('历史 UI 渲染撤销重做状态与持久审计',()=>{
  const controls=renderHistoryButtons({canUndo:true,canRedo:false,nextUndo:{label:'批量安排项目分工（2 条）'}});
  assert.match(controls,/撤销：批量安排项目分工/);
  assert.match(controls,/id="planning-redo" disabled/);
  const audit=renderAuditTrail([
    {action:'redo',label:'安排项目分工',actor:'管理员',createdAt:'2026-08-17T10:00:00Z',text:'重做：安排项目分工',commandCount:1,commandTypes:['assignment.assign']}
  ]);
  assert.match(audit,/重做/);
  assert.match(audit,/assignment\.assign/);
});

test('管理员可把一次自动排期作为一个事务撤销、重做并查看三段审计',async()=>{
  const session=await boot('admin');
  try{
    document.querySelector('[data-planning-view="auto"]').click();
    document.querySelector('#generate-auto-draft').click();
    await tick(8);
    const apply=document.querySelector('#apply-auto-draft');
    assert.ok(apply);
    apply.click();
    await tick(0);
    document.querySelector('#planning-confirm-ok').click();
    await tick(15);

    assert.equal(session.getData().assignments.filter(item=>item.needId==='n1').length,1);
    assert.equal(session.getSaves(),1);
    const undo=document.querySelector('#planning-undo');
    assert.equal(undo.disabled,false);
    assert.match(undo.title,/撤销：安排项目分工/);

    undo.click();
    await tick(0);
    document.querySelector('#history-confirm-ok').click();
    await tick(25);
    assert.equal(session.getData().assignments.filter(item=>item.needId==='n1').length,0);
    assert.equal(session.getSaves(),2);
    assert.equal(document.querySelector('#planning-redo').disabled,false);

    document.querySelector('#planning-redo').click();
    await tick(0);
    document.querySelector('#history-confirm-ok').click();
    await tick(25);
    assert.equal(session.getData().assignments.filter(item=>item.needId==='n1').length,1);
    assert.equal(session.getSaves(),3);

    document.querySelector('#planning-audit-toggle').click();
    await tick(2);
    const drawer=document.querySelector('#planning-audit-drawer');
    assert.ok(drawer.classList.contains('open'));
    const text=drawer.textContent;
    assert.match(text,/执行/);
    assert.match(text,/撤销/);
    assert.match(text,/重做/);
    assert.equal(drawer.querySelectorAll('.history-item').length,3);
    assert.ok(session.getSyncs()>=2,'Undo/Redo 应同步人员账号关联');
  }finally{session.dom.window.close();clearGlobals();}
});

test('只读账号可查看审计入口，但撤销和重做不可用',async()=>{
  const session=await boot('viewer');
  try{
    assert.equal(document.querySelector('#planning-undo').disabled,true);
    assert.equal(document.querySelector('#planning-redo').disabled,true);
    const audit=document.querySelector('#planning-audit-toggle');
    assert.ok(audit);
    assert.equal(audit.disabled,false);
    audit.click();
    assert.ok(document.querySelector('#planning-audit-drawer').classList.contains('open'));
    assert.equal(session.getSaves(),0);
  }finally{session.dom.window.close();clearGlobals();}
});

test('Planning Center 加载历史样式、控件根节点与独立 bootstrap',()=>{
  const html=fs.readFileSync(path.join(root,'src/planning.html'),'utf8');
  assert.match(html,/planning-center\/history\.css/);
  assert.match(html,/id="planning-history-controls"/);
  assert.match(html,/id="planning-history-root"/);
  assert.match(html,/planning-center\/history-bootstrap\.mjs/);
});
