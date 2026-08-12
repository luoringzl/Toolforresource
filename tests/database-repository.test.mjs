import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require=createRequire(import.meta.url);
const { createDatabaseRepository }=require('../electron/database-repository.cjs');
const { DB_VERSION, emptyDatabase }=require('../electron/database-defaults.cjs');

function workspace(){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'resource-db-test-'));
  return {directory,filePath:path.join(directory,'project-resource-database.json')};
}

function clock(){
  let index=0;
  return ()=>new Date(Date.UTC(2026,7,12,10,0,index++));
}

test('Electron Repository 首次读取返回 V7 默认数据库',()=>{
  const {directory,filePath}=workspace();
  try{
    const repository=createDatabaseRepository({filePath,defaultsFactory:emptyDatabase,version:DB_VERSION,now:clock()});
    const db=repository.load();
    assert.equal(db.version,7);
    assert.deepEqual(db.settings.planning.forecastHorizons,[30,60,90]);
    assert.equal(repository.diagnostics().exists,false);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('原子保存写入 V7、哈希和诊断信息',()=>{
  const {directory,filePath}=workspace();
  try{
    const repository=createDatabaseRepository({filePath,defaultsFactory:emptyDatabase,version:DB_VERSION,now:clock()});
    const db=repository.load();db.projects.push({id:'p1',name:'保存项目'});
    const result=repository.save(db);
    assert.equal(result.ok,true);
    assert.equal(result.previousSha256,'');
    assert.equal(result.sha256.length,64);
    const persisted=JSON.parse(fs.readFileSync(filePath,'utf8'));
    assert.equal(persisted.version,7);
    assert.equal(persisted.meta.schemaVersion,7);
    assert.equal(persisted.projects[0].name,'保存项目');
    const diagnostics=repository.diagnostics();
    assert.equal(diagnostics.exists,true);
    assert.equal(diagnostics.valid,true);
    assert.equal(diagnostics.version,7);
    assert.equal(diagnostics.sha256,result.sha256);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('每次覆盖前创建恢复点并只保留最近 N 个',()=>{
  const {directory,filePath}=workspace();
  try{
    const repository=createDatabaseRepository({filePath,defaultsFactory:emptyDatabase,version:DB_VERSION,backupLimit:2,now:clock()});
    for(let i=1;i<=4;i++){
      const db=repository.load();db.settings.companyName=`版本${i}`;assert.equal(repository.save(db).ok,true);
    }
    const points=repository.recoveryPoints();
    assert.equal(points.length,2);
    assert.ok(points.every(point=>point.valid));
    assert.equal(repository.diagnostics().recoveryCount,2);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('恢复点可以恢复旧数据库，并先保存当前状态作为恢复点',()=>{
  const {directory,filePath}=workspace();
  try{
    const repository=createDatabaseRepository({filePath,defaultsFactory:emptyDatabase,version:DB_VERSION,backupLimit:5,now:clock()});
    let db=repository.load();db.settings.companyName='版本1';repository.save(db);
    db=repository.load();db.settings.companyName='版本2';repository.save(db);
    const point=repository.recoveryPoints().find(item=>JSON.parse(fs.readFileSync(item.path,'utf8')).settings.companyName==='版本1');
    assert.ok(point);
    db=repository.load();db.settings.companyName='版本3';repository.save(db);
    const result=repository.restoreRecoveryPoint(point.name);
    assert.equal(result.ok,true);
    assert.equal(result.restoredFrom,point.name);
    assert.ok(result.currentRecovery);
    assert.equal(repository.load().settings.companyName,'版本1');
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('损坏主数据库会被移出主路径并返回干净默认库',()=>{
  const {directory,filePath}=workspace();
  try{
    fs.writeFileSync(filePath,'{broken','utf8');
    const repository=createDatabaseRepository({filePath,defaultsFactory:emptyDatabase,version:DB_VERSION,now:clock()});
    const db=repository.load();
    assert.equal(db.version,7);
    assert.match(db.recoveryWarning,/损坏文件已隔离/);
    assert.equal(fs.existsSync(filePath),false);
    assert.ok(fs.readdirSync(directory).some(name=>name.includes('.broken-')));
    assert.equal(repository.load().recoveryWarning,undefined);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('读取旧数据时深度补齐 V7 planning defaults 而不覆盖旧设置',()=>{
  const {directory,filePath}=workspace();
  try{
    fs.writeFileSync(filePath,JSON.stringify({
      version:6,projects:[],people:[],assignments:[],staffingNeeds:[],activity:[],
      settings:{companyName:'旧公司',planning:{defaultGanttDays:120}}
    }),'utf8');
    const repository=createDatabaseRepository({filePath,defaultsFactory:emptyDatabase,version:DB_VERSION,now:clock()});
    const db=repository.load();
    assert.equal(db.version,6);
    assert.equal(db.settings.companyName,'旧公司');
    assert.equal(db.settings.planning.defaultGanttDays,120);
    assert.deepEqual(db.settings.planning.forecastHorizons,[30,60,90]);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('不存在或损坏的恢复点不会覆盖当前数据库',()=>{
  const {directory,filePath}=workspace();
  try{
    const repository=createDatabaseRepository({filePath,defaultsFactory:emptyDatabase,version:DB_VERSION,now:clock()});
    const db=repository.load();db.settings.companyName='当前';repository.save(db);
    const missing=repository.restoreRecoveryPoint('missing.json');
    assert.equal(missing.ok,false);
    assert.equal(repository.load().settings.companyName,'当前');
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('恢复点可由管理员清空',()=>{
  const {directory,filePath}=workspace();
  try{
    const repository=createDatabaseRepository({filePath,defaultsFactory:emptyDatabase,version:DB_VERSION,now:clock()});
    repository.save(repository.load());
    repository.save(repository.load());
    assert.equal(repository.recoveryPoints().length,1);
    const result=repository.clearRecoveryPoints();
    assert.equal(result.ok,true);
    assert.equal(result.removed,1);
    assert.equal(repository.recoveryPoints().length,0);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
