import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('界面可启动，并能通过弹窗新建项目', async () => {
  const html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8').replace('<script type="module" src="app.mjs"></script>', '');
  const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.FormData = dom.window.FormData;
  globalThis.Blob = dom.window.Blob;
  globalThis.URL = dom.window.URL;

  localStorage.setItem('project-resource-db',JSON.stringify({version:1,settings:{warningDays:7},activity:[],staffingNeeds:[],projects:[{id:'p1',name:'视觉测试项目',priority:'P1 高',status:'视频制作中',ddl:'2099-12-31',overallProgress:60,assetProgress:100,videoProgress:40}],people:[{id:'u1',name:'测试导演',function:'导演',capacity:100,employmentStatus:'在岗'}],assignments:[{id:'a1',projectId:'p1',personId:'u1',role:'项目负责人/导演',stage:'统筹',allocation:50,status:'进行中'}]}));

  await import(`${pathToFileURL(path.join(root, 'src/app.mjs')).href}?smoke=1`);
  assert.match(document.querySelector('#view-dashboard').textContent, /进行中项目/);
  assert.ok(document.querySelector('.project-control-item'),'工作台应突出项目进度控制');

  document.querySelector('[data-view="projects"]').click();
  assert.ok(document.querySelector('.project-board-row'),'项目列表应使用进度与团队工作卡');
  document.querySelector('[data-open-project="p1"]').click();
  assert.ok(document.querySelector('.project-command'),'项目详情首屏应显示进度指挥区');
  assert.equal(document.querySelectorAll('.team-role-card').length,5,'项目详情应重点显示五个核心岗位');
  assert.ok(document.querySelector('.project-info-collapse'),'项目基础资料应收纳在折叠区域');
  document.querySelector('[data-close-modal]').click();

  document.querySelector('#quick-project').click();
  const form = document.querySelector('#project-form');
  assert.ok(form, '新建项目弹窗应出现');
  form.elements.name.value = '界面测试项目';
  form.elements.status.value = '制作中';
  form.elements.overallProgress.value = '25';
  document.querySelector('#save-project').click();
  await new Promise(resolve => setTimeout(resolve, 5));

  document.querySelector('[data-view="projects"]').click();
  assert.match(document.querySelector('#view-projects').textContent, /界面测试项目/);
  assert.ok(localStorage.getItem('project-resource-db'));
  dom.window.close();
});
