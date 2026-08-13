import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { emptyDatabase } from '../src/core.mjs';
import { installWorkCalendarFields, readWorkCalendarPatch } from '../src/planning-center/work-calendar-ui.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tick=(ms=0)=>new Promise(resolve=>setTimeout(resolve,ms));

test('工作日历表单 helper 可渲染并解析例外日期',()=>{
  const dom=new JSDOM('<form id="f"><div class="form-actions"></div></form>');
  const form=dom.window.document.querySelector('#f');
  installWorkCalendarFields(form,{nonWorkingDates:['2026-10-01'],workingDateOverrides:['2026-10-10']});
  assert.equal(form.elements.nonWorkingDates.value,'2026-10-01');
  assert.equal(form.elements.workingDateOverrides.value,'2026-10-10');
  form.elements.nonWorkingDates.value='2026-10-02\n2026-10-01, 2026-10-02';
  form.elements.workingDateOverrides.value='2026-10-11 2026-10-10';
  assert.deepEqual(readWorkCalendarPatch(form),{
    nonWorkingDates:['2026-10-01','2026-10-02'],
    workingDateOverrides:['2026-10-10','2026-10-11']
  });
  dom.window.close();
});

test('Planning Center 管理员可保存工作日历例外，无效日期不会落库',async()=>{
  const html=fs.readFileSync(path.join(root,'src/planning.html'),'utf8');
  const dom=new JSDOM(html,{url:'http://localhost/planning.html',pretendToBeVisual:true});
  globalThis.window=dom.window;
  globalThis.document=dom.window.document;
  globalThis.localStorage=dom.window.localStorage;
  globalThis.FormData=dom.window.FormData;
  globalThis.Blob=dom.window.Blob;
  globalThis.URL=dom.window.URL;

  let data=emptyDatabase();
  let saves=0;
  dom.window.desktopAPI={
    async authStatus(){return {authenticated:true,user:{id:'admin',username:'admin',displayName:'日历管理员',role:'admin'}};},
    async loadData(){return structuredClone(data);},
    async saveData(next){saves+=1;data=structuredClone(next);return {ok:true};},
    async syncPeopleAccounts(){return {ok:true};},
    async databaseDiagnostics(){return {exists:true,valid:true,sizeBytes:100,version:7,recoveryCount:0};},
    async listRecoveryPoints(){return [];},
    async clearRecoveryPoints(){return {ok:true,removed:0};}
  };

  try{
    await import(`${pathToFileURL(path.join(root,'src/planning-center/planning-app.mjs')).href}?work-calendar-ui=${Date.now()}`);
    await tick(5);
    document.querySelector('[data-planning-view="settings"]').click();
    const form=document.querySelector('#planning-settings-form');
    assert.ok(form.elements.nonWorkingDates);
    assert.ok(form.elements.workingDateOverrides);

    form.elements.nonWorkingDates.value='2026-10-01\n2026-10-02';
    form.elements.workingDateOverrides.value='2026-10-10';
    form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
    await tick(10);
    assert.equal(saves,1);
    assert.deepEqual(data.settings.planning.nonWorkingDates,['2026-10-01','2026-10-02']);
    assert.deepEqual(data.settings.planning.workingDateOverrides,['2026-10-10']);

    const refreshed=document.querySelector('#planning-settings-form');
    refreshed.elements.nonWorkingDates.value='2026-02-30';
    refreshed.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
    await tick(5);
    assert.equal(saves,1,'无效日期不应触发持久化');
    assert.match(document.querySelector('#planning-message').textContent,/公司休息日格式无效/);
  }finally{
    dom.window.close();
    delete globalThis.window;delete globalThis.document;delete globalThis.localStorage;delete globalThis.FormData;delete globalThis.Blob;delete globalThis.URL;
  }
});

test('Planning Center 加载工作日历独立样式',()=>{
  const html=fs.readFileSync(path.join(root,'src/planning.html'),'utf8');
  assert.match(html,/planning-center\/work-calendar\.css/);
});
