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

  await import(`${pathToFileURL(path.join(root, 'src/app.mjs')).href}?smoke=1`);
  assert.match(document.querySelector('#view-dashboard').textContent, /进行中项目/);

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
