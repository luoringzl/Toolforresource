import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { emptyDatabase } from '../src/core.mjs';
import { renderAutoDraft, renderDatabaseHealth } from '../src/planning-center/renderers.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tick=(ms=0)=>new Promise(resolve=>setTimeout(resolve,ms));

function fixture(){
  const db=emptyDatabase();
  db.projects.push({
    id:'p1',name:'规划电影',priority:'P0 紧急',status:'视频制作中',startDate:'2026-08-12',ddl:'2026-09-20',
    assetCompletionDate:'2026-08-20',videoCompletionDate:'2026-09-15',overallProgress:45
  });
  db.people.push(
    {id:'busy',name:'忙碌动画师',department:'AI项目组',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'高级'}]},
    {id:'free',name:'空闲动画师',department:'AI项目组',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'高级'}]}
  );
  db.assignments.push({
    id:'a1',projectId:'p1',personId:'busy',role:'其它支持',stage:'其它',allocation:80,status:'进行中',startDate:'2026-08-12',endDate:'2026-08-25'
  });
  db.staffingNeeds.push({id:'n1',projectId:'p1',role:'视频制作人员',stage:'视频',requiredCapacity:50,neededBy:'2026-08-12',status:'待安排'});
  return db;
}

test('Planning Center 可启动、规划、原子应用草案、修改设置并查看数据库健康',async()=>{
  const html=fs.readFileSync(path.join(root,'src/planning.html'),'utf8');
  const dom=new JSDOM(html,{url:'http://localhost/planning.html',pretendToBeVisual:true});
  globalThis.window=dom.window;
  globalThis.document=dom.window.document;
  globalThis.localStorage=dom.window.localStorage;
  globalThis.FormData=dom.window.FormData;
  globalThis.Blob=dom.window.Blob;
  globalThis.URL=dom.window.URL;

  let data=fixture();
  let saveCalls=0;
  let syncCalls=0;
  const desktopAPI={
    async authStatus(){return {authenticated:true,user:{id:'admin',username:'admin',displayName:'规划管理员',role:'admin',mustChangePassword:false}};},
    async loadData(){return structuredClone(data);},
    async saveData(next){saveCalls+=1;data=structuredClone(next);return {ok:true};},
    async syncPeopleAccounts(){syncCalls+=1;return {ok:true};},
    async databaseDiagnostics(){return {exists:true,valid:true,sizeBytes:4096,version:7,updatedAt:'2026-08-12T12:00:00.000Z',sha256:'a'.repeat(64),recoveryCount:1};},
    async listRecoveryPoints(){return [{name:'database-20260812-120000-000.json',sizeBytes:3000,modifiedAt:'2026-08-12T12:00:00.000Z',valid:true,version:7}];},
    async restoreRecoveryPoint(){return {ok:true};},
    async clearRecoveryPoints(){return {ok:true,removed:1};}
  };
  dom.window.desktopAPI=desktopAPI;

  try{
    await import(`${pathToFileURL(path.join(root,'src/planning-center/planning-app.mjs')).href}?planning-smoke=${Date.now()}`);
    await tick(5);

    const start=document.querySelector('#planning-start-date');
    start.value='2026-08-12';
    start.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
    await tick(5);

    assert.equal(document.querySelector('#planning-account-name').textContent,'规划管理员');
    assert.match(document.querySelector('#planning-summary').textContent,/待安排需求/);
    assert.equal(document.querySelectorAll('.planning-metric').length,4);
    assert.equal(document.querySelectorAll('.horizon-card').length,3);
    assert.ok(document.querySelectorAll('.heat-cell').length>=90,'热力图应覆盖最大预测周期');
    assert.match(document.querySelector('#planning-recommendations').textContent,/空闲动画师/,'需求推荐应优先展示有产能的匹配人员');
    assert.ok(document.querySelector('#resource-gantt .gantt-row'),'Resource Gantt 应渲染人员行');
    assert.ok(document.querySelector('#project-gantt .gantt-bar.project'),'Project Gantt 应渲染项目主条');

    document.querySelector('[data-planning-view="gantt"]').click();
    assert.ok(document.querySelector('#planning-gantt').classList.contains('active'));
    const firstRange=document.querySelector('#resource-gantt-range').textContent;
    document.querySelector('[data-gantt="resource"][data-dir="next"]').click();
    const secondRange=document.querySelector('#resource-gantt-range').textContent;
    assert.notEqual(secondRange,firstRange,'甘特图应支持按配置窗口翻页');
    assert.ok(document.querySelectorAll('#resource-gantt .capacity-cell').length>0,'翻页后逐日产能格仍应使用局部 viewport');

    document.querySelector('[data-planning-view="auto"]').click();
    document.querySelector('#generate-auto-draft').click();
    await tick(5);
    assert.match(document.querySelector('#planning-auto-draft').textContent,/空闲动画师/);
    assert.ok(document.querySelector('#apply-auto-draft'),'管理员应能应用可行草案');
    document.querySelector('#apply-auto-draft').click();
    await tick(0);
    assert.ok(document.querySelector('#planning-confirm-ok'));
    document.querySelector('#planning-confirm-ok').click();
    await tick(10);
    assert.equal(saveCalls,1,'自动排期草案应使用一次原子批量保存');
    assert.equal(data.assignments.filter(item=>item.needId==='n1').length,1);
    assert.equal(data.staffingNeeds.find(item=>item.id==='n1').status,'已满足');

    document.querySelector('[data-planning-view="settings"]').click();
    const form=document.querySelector('#planning-settings-form');
    form.elements.defaultGanttViewportDays.value='10';
    form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
    await tick(10);
    assert.equal(saveCalls,2,'规划参数保存应通过 Application Service 持久化');
    assert.equal(data.settings.planning.defaultGanttViewportDays,10);

    document.querySelector('[data-planning-view="health"]').click();
    await tick(10);
    assert.match(document.querySelector('#planning-health-root').textContent,/数据库状态/);
    assert.match(document.querySelector('#planning-health-root').textContent,/database-20260812-120000-000\.json/);
    assert.ok(document.querySelector('[data-restore-point]'),'管理员应看到恢复入口');
    assert.equal(syncCalls,0,'规划中心的排班和规划设置操作不应无故触发账号同步');
  }finally{
    dom.window.close();
    delete globalThis.window;delete globalThis.document;delete globalThis.localStorage;delete globalThis.FormData;delete globalThis.Blob;delete globalThis.URL;
  }
});

test('Planning Center 渲染器明确区分延期草案与数据库恢复点',()=>{
  const draft={
    feasible:true,
    summary:{proposalCount:1,proposedPeople:1,allocatedCapacity:40,delayedProposals:1,maxDelayDays:5,unresolvedCapacity:0},
    proposals:[{projectName:'项目A',role:'视频制作人员',personName:'小周',allocation:40,startDate:'2026-08-20',requestedStartDate:'2026-08-15',meetsRequestedStart:false,delayDays:5,reasons:['职位直接匹配'],risks:['晚于期望到岗 5 天']}],
    unresolved:[]
  };
  assert.match(renderAutoDraft(draft,{canManage:true}),/延期 5 天/);
  const health=renderDatabaseHealth({valid:true,version:7,sizeBytes:1024,recoveryCount:1},[{name:'restore.json',modifiedAt:'2026-08-12',sizeBytes:500,version:7}],{isAdmin:true});
  assert.match(health,/restore\.json/);
  assert.match(health,/data-restore-point/);
});

test('业务工作台提供规划中心入口',()=>{
  const html=fs.readFileSync(path.join(root,'src/index.html'),'utf8');
  assert.match(html,/href="planning\.html"/);
  assert.match(html,/规划中心/);
});
