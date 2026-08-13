import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { emptyDatabase } from '../src/core.mjs';
import { renderOptimizationResult, renderOptimizerControls } from '../src/planning-center/optimizer-ui.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tick=(ms=0)=>new Promise(resolve=>setTimeout(resolve,ms));

function fixture(){
  const db=emptyDatabase();
  db.projects.push({id:'p1',name:'优化项目',status:'制作中',priority:'P1 高',startDate:'2026-08-17',ddl:'2026-09-30'});
  db.people.push(
    {id:'u1',name:'动画甲',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'高级'}]},
    {id:'u2',name:'动画乙',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'高级'}]},
    {id:'u3',name:'动画丙',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师'],skillProfiles:[{skill:'AI视频制作',level:'中级'}]}
  );
  db.staffingNeeds.push({id:'n1',projectId:'p1',role:'视频制作人员',stage:'视频',requiredCapacity:80,neededBy:'2026-08-17',status:'待安排'});
  return db;
}

function installGlobals(dom){
  globalThis.window=dom.window;
  globalThis.document=dom.window.document;
  globalThis.localStorage=dom.window.localStorage;
  globalThis.FormData=dom.window.FormData;
  globalThis.Blob=dom.window.Blob;
  globalThis.URL=dom.window.URL;
}
function clearGlobals(){
  delete globalThis.window;delete globalThis.document;delete globalThis.localStorage;delete globalThis.FormData;delete globalThis.Blob;delete globalThis.URL;
}

test('优化器渲染器区分模拟权限与真实应用权限',()=>{
  assert.match(renderOptimizerControls(),/综合最优/);
  const result={objective:'balanced',objectiveLabel:'综合最优',options:[{
    id:'balanced',rank:1,label:'均衡方案',description:'测试方案',optimizerScore:120,
    metrics:{resolvedNeeds:1,requestedNeeds:1,unresolvedCapacity:0,delayedProposals:0,totalDelayDays:0,proposedPeople:2,conflictCount:0,averageRecommendationScore:95},
    explanations:['已解决 1/1 条需求','无产能冲突'],draft:{proposals:[{id:'x'}]}
  }]};
  assert.match(renderOptimizationResult(result,{canManage:true}),/data-apply-option="balanced"/);
  const viewer=renderOptimizationResult(result,{canManage:false});
  assert.doesNotMatch(viewer,/data-apply-option/);
  assert.match(viewer,/data-preview-option/);
});

test('管理员可比较多方案、预览并以一次保存应用选中方案',async()=>{
  const html=fs.readFileSync(path.join(root,'src/planning.html'),'utf8');
  const dom=new JSDOM(html,{url:'http://localhost/planning.html',pretendToBeVisual:true});
  installGlobals(dom);
  let data=fixture();
  let saves=0;
  dom.window.desktopAPI={
    async authStatus(){return {authenticated:true,user:{id:'admin',username:'admin',displayName:'优化管理员',role:'admin'}};},
    async loadData(){return structuredClone(data);},
    async saveData(next){saves+=1;data=structuredClone(next);return {ok:true};},
    async syncPeopleAccounts(){return {ok:true};},
    async databaseDiagnostics(){return {exists:true,valid:true,sizeBytes:100,version:7,recoveryCount:0};},
    async listRecoveryPoints(){return [];},
    async clearRecoveryPoints(){return {ok:true,removed:0};}
  };
  try{
    await import(`${pathToFileURL(path.join(root,'src/planning-center/planning-app.mjs')).href}?optimizer-admin=${Date.now()}`);
    await tick(5);
    const start=document.querySelector('#planning-start-date');
    start.value='2026-08-17';
    start.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
    await tick(5);
    document.querySelector('[data-planning-view="auto"]').click();
    const objective=document.querySelector('#schedule-objective');
    objective.value='concentrated';
    document.querySelector('#generate-optimized-options').click();
    await tick(10);

    const cards=[...document.querySelectorAll('.optimizer-option')];
    assert.ok(cards.length>=2,'应生成至少两种不重复资源组合');
    const recommended=cards.find(card=>card.classList.contains('recommended'));
    assert.ok(recommended);
    assert.equal(recommended.dataset.optionId,'concentrated');
    assert.match(recommended.textContent,/使用人员1/);
    assert.match(document.querySelector('#planning-draft-label').textContent,/推荐：少人集中/);

    const another=cards.find(card=>card.dataset.optionId!=='concentrated');
    another.querySelector('[data-preview-option]').click();
    assert.equal(another.dataset.previewing,'true');
    assert.match(document.querySelector('#planning-draft-label').textContent,/方案 #/);

    document.querySelector('[data-apply-option="concentrated"]').click();
    await tick(0);
    document.querySelector('#planning-confirm-ok').click();
    await tick(10);
    assert.equal(saves,1,'优化方案必须整批只保存一次');
    const applied=data.assignments.filter(item=>item.needId==='n1');
    assert.equal(applied.length,1);
    assert.equal(applied[0].allocation,80);
  }finally{dom.window.close();clearGlobals();}
});

test('只读账号可生成和预览方案但不能应用真实排班',async()=>{
  const html=fs.readFileSync(path.join(root,'src/planning.html'),'utf8');
  const dom=new JSDOM(html,{url:'http://localhost/planning.html',pretendToBeVisual:true});
  installGlobals(dom);
  let saves=0;
  dom.window.desktopAPI={
    async authStatus(){return {authenticated:true,user:{id:'viewer',username:'viewer',displayName:'查看者',role:'viewer'}};},
    async loadData(){return structuredClone(fixture());},
    async saveData(){saves+=1;return {ok:true};},
    async databaseDiagnostics(){return null;},
    async listRecoveryPoints(){return [];}
  };
  try{
    await import(`${pathToFileURL(path.join(root,'src/planning-center/planning-app.mjs')).href}?optimizer-viewer=${Date.now()}-${Math.random()}`);
    await tick(5);
    const start=document.querySelector('#planning-start-date');
    start.value='2026-08-17';
    start.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
    await tick(5);
    document.querySelector('[data-planning-view="auto"]').click();
    document.querySelector('#generate-optimized-options').click();
    await tick(10);
    assert.ok(document.querySelectorAll('.optimizer-option').length>0);
    assert.ok(document.querySelector('[data-preview-option]'));
    assert.equal(document.querySelector('[data-apply-option]'),null);
    assert.equal(document.querySelector('#apply-auto-draft'),null);
    assert.equal(saves,0);
  }finally{dom.window.close();clearGlobals();}
});

test('Planning Center 加载优化器独立样式',()=>{
  const html=fs.readFileSync(path.join(root,'src/planning.html'),'utf8');
  assert.match(html,/planning-center\/optimizer\.css/);
});
