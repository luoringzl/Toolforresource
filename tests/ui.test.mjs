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

  localStorage.setItem('project-resource-db',JSON.stringify({version:1,settings:{warningDays:7},activity:[],staffingNeeds:[],projects:[{id:'p1',name:'视觉测试项目',priority:'P1 高',status:'视频制作中',startDate:'2099-01-15',ddl:'2099-12-31',overallProgress:60,assetProgress:100,videoProgress:40},{id:'p2',name:'历史电影',priority:'P2 中',status:'已完成',startDate:'2026-01-10',duration:'65 分钟'}],people:[{id:'u1',name:'测试导演',function:'导演',capacity:100,employmentStatus:'在岗'},{id:'u2',name:'满载动画师',position:'AI动画师',capacity:100,employmentStatus:'在岗'},{id:'u3',name:'异动动画师',position:'AI动画师',capacity:100,employmentStatus:'异动'}],assignments:[{id:'a1',projectId:'p1',personId:'u1',role:'项目负责人/导演',stage:'统筹',allocation:50,status:'进行中'},{id:'a2',projectId:'p1',personId:'u2',role:'其它支持',stage:'其它',allocation:100,status:'进行中'},{id:'a3',projectId:'p2',personId:'u1',role:'项目负责人/导演',stage:'统筹',allocation:100,status:'已结束'}]}));

  await import(`${pathToFileURL(path.join(root, 'src/app.mjs')).href}?smoke=1`);
  assert.match(document.querySelector('#view-dashboard').textContent, /进行中项目/);
  assert.ok(document.querySelector('.project-control-item'),'工作台应突出项目进度控制');

  document.querySelector('[data-view="projects"]').click();
  assert.ok(document.querySelector('.project-board-row'),'项目列表应使用进度与团队工作卡');
  assert.equal(document.querySelector('.priority-badge').textContent,'P1','优先级应使用不换行角标');
  assert.equal(document.querySelector('.project-title-line strong').getAttribute('title'),'视觉测试项目','完整项目名应保留在悬停提示中');
  assert.ok(document.querySelector('#project-start-from'),'项目资料库应提供启动时间起止筛选');
  document.querySelector('#project-start-from').value='2098-01-01';
  document.querySelector('#project-start-from').dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  assert.equal(document.querySelectorAll('.project-board-row').length,1,'启动时间筛选应排除范围外项目');
  document.querySelector('#project-start-from').value='';
  document.querySelector('#project-start-from').dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  document.querySelector('[data-open-project="p1"]').click();
  assert.ok(document.querySelector('.project-command'),'项目详情首屏应显示进度指挥区');
  assert.equal(document.querySelectorAll('.team-role-card').length,6,'项目详情应显示五个核心岗位和可选编导岗位');
  assert.ok(document.querySelector('.project-info-collapse'),'项目基础资料应收纳在折叠区域');
  document.querySelector('[data-assign-role="资产制作人员"]').click();
  assert.equal(document.querySelectorAll('.assignment-person-check').length,2,'项目岗位应支持一次多选人员并排除非在岗人员');
  document.querySelectorAll('.assignment-person-check').forEach(input=>{input.checked=true;input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
  document.querySelector('[name="allocation"]').value='10';
  document.querySelector('#save-assignment').click();
  await new Promise(resolve => setTimeout(resolve, 0));
  document.querySelector('#confirm-ok')?.click();
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(JSON.parse(localStorage.getItem('project-resource-db')).assignments.filter(item=>item.projectId==='p1'&&item.role==='资产制作人员').length,2);

  document.querySelector('[data-view="people"]').click();
  assert.ok(document.querySelector('.person-card'),'人员库应使用能力与产能卡片');
  assert.equal(document.querySelectorAll('.person-card').length,3);
  document.querySelector('[data-people-metric="available"]').click();
  assert.equal(document.querySelectorAll('.person-card').length,1,'可调度指标卡应直接筛选剩余产能人员');
  document.querySelector('[data-people-metric="all"]').click();
  document.querySelector('.person-card').click();
  assert.ok(document.querySelector('.person-detail-summary'),'点击人员应显示产能概览');
  assert.match(document.querySelector('.work-history-section:last-child').textContent,/历史电影/,'人员详情应把完结项目列入历史记录');
  assert.match(document.querySelector('.work-history-section:last-child').textContent,/负责整片 65 分钟/,'导演历史产出应默认使用整片时长');
  document.querySelector('#person-detail-edit').click();
  assert.ok(document.querySelector('.person-profile-form'),'人员编辑应使用完整能力档案表单');
  assert.match(document.querySelector('[name="releaseDate"]').closest('.field').textContent,/仅作排期参考/);
  assert.ok(document.querySelector('.skill-selector'),'人员编辑应支持技能多选和等级');
  assert.ok(document.querySelector('.position-selector'),'职位应支持多选');
  document.querySelector('.skill-check').click();
  assert.ok(document.querySelector('.capability-edit-row'),'选中技能后应显示对应制作能力输入');
  document.querySelector('#add-workload').click();
  const addedWorkload=[...document.querySelectorAll('.workload-edit-row')].at(-1);
  addedWorkload.querySelector('.work-source').value='external';
  addedWorkload.querySelector('.work-source').dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  addedWorkload.querySelector('.work-name').value='内部培训';
  addedWorkload.querySelector('.work-department').value='教培部门';
  addedWorkload.querySelector('.work-allocation').value='30';
  document.querySelector('#save-person').click();
  await new Promise(resolve => setTimeout(resolve, 5));
  const savedPeople=JSON.parse(localStorage.getItem('project-resource-db')).people;
  assert.equal(savedPeople[0].externalAssignments[0].name,'内部培训');

  document.querySelector('[data-view="schedule"]').click();
  assert.equal(document.querySelectorAll('.core-gap-item').length,1,'同一项目的多个缺员岗位应汇总为一张项目卡');
  assert.equal(document.querySelectorAll('.candidate').length,2,'候选人员应包含满载人员并排除非在岗人员');

  document.querySelector('#quick-project').click();
  const form = document.querySelector('#project-form');
  assert.ok(form, '新建项目弹窗应出现');
  assert.equal(form.elements.projectAddress,undefined,'项目地址字段应被删除');
  form.elements.name.value = '界面测试项目';
  assert.ok(form.elements.startDate,'项目资料应包含启动时间');
  assert.ok([...form.elements.settlementStatus.options].some(option=>option.value==='不结算'),'结算情况应包含不结算');
  form.elements.projectType.value = '测试项目';
  form.elements.projectType.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  assert.equal(document.querySelector('[data-project-field="testResult"]').hidden,false,'测试项目应显示测试结果');
  form.elements.productionRequirement.value = '剧集制作';
  form.elements.productionRequirement.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  assert.equal(document.querySelector('[data-project-field="episodeCount"]').hidden,false,'剧集制作应填写集数');
  form.elements.episodeCount.value='12';
  form.elements.status.value = '制作中';
  form.elements.overallProgress.value = '25';
  document.querySelector('#save-project').click();
  await new Promise(resolve => setTimeout(resolve, 5));

  document.querySelector('[data-view="projects"]').click();
  assert.match(document.querySelector('#view-projects').textContent, /界面测试项目/);
  assert.ok(localStorage.getItem('project-resource-db'));
  dom.window.close();
});
