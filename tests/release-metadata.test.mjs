import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('正式发布版本统一为 2.7.0',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.version,'2.7.0');
  assert.equal(pkg.build.nsis.artifactName,'项目人员调度台-Setup-${version}-${arch}.${ext}');
  assert.equal(pkg.build.portable.artifactName,'项目人员调度台-Portable-${version}-${arch}.${ext}');
  const readme=read('README.md');
  assert.match(readme,/项目人员调度台 2\.7\.0/);
  assert.match(readme,/项目人员调度台-Setup-2\.7\.0-x64\.exe/);
  assert.match(readme,/项目人员调度台-Portable-2\.7\.0-x64\.exe/);
  assert.match(readme,/关键路径优先队列/);
  const changelog=read('CHANGELOG.md');
  assert.match(changelog,/## 2\.7\.0/);
  assert.match(changelog,/Dependency Gate/);
});

test('发布 CI 使用标准测试流程和 GitHub Actions v7',()=>{
  const workflow=read('.github/workflows/build-windows.yml');
  assert.match(workflow,/actions\/checkout@v7/);
  assert.match(workflow,/actions\/setup-node@v7/);
  assert.match(workflow,/actions\/upload-artifact@v7/);
  assert.match(workflow,/run: npm test/);
  assert.match(workflow,/node-version: 22/);
  assert.doesNotMatch(workflow,/Get-ChildItem tests/,'正式 workflow 不得残留诊断逐文件脚本');
});
