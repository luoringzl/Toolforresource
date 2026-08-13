import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDatabase } from '../src/core.mjs';
import { createAppStore } from '../src/state/app-store.mjs';
import { createApplicationService } from '../src/services/application-service.mjs';
import {
  appendCommandAudit,
  commandAuditTrail,
  createCommandHistory,
  restoreSnapshotPreservingAudit
} from '../src/services/command-history.mjs';

function fakeApi(initial=emptyDatabase()){
  let data=structuredClone(initial);
  let failNextSave=false;
  const calls=[];
  return {
    calls,
    async loadData(){calls.push('load');return structuredClone(data);},
    async saveData(next){
      calls.push('save');
      if(failNextSave){failNextSave=false;return {ok:false,error:'模拟磁盘失败'};}
      data=structuredClone(next);return {ok:true};
    },
    async syncPeopleAccounts(people){calls.push(`sync:${people.length}`);return {ok:true};},
    failSave(){failNextSave=true;},
    snapshot(){return structuredClone(data);}
  };
}

function seededDb(){
  const db=emptyDatabase();
  db.projects.push({id:'p1',name:'项目A',status:'制作中',startDate:'2026-08-17',ddl:'2026-09-30'});
  db.people.push(
    {id:'u1',name:'甲',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师']},
    {id:'u2',name:'乙',capacity:100,employmentStatus:'在岗',position:'AI动画师',positions:['AI动画师']}
  );
  return db;
}

function serviceFixture(db=seededDb()){
  const api=fakeApi(db);
  const store=createAppStore({database:db,user:{id:'admin',username:'admin',displayName:'管理员',role:'admin'}});
  const history=createCommandHistory({idFactory:(()=>{let i=0;return()=>`tx-${++i}`;})(),now:()=>new Date('2026-08-17T10:00:00+08:00')});
  const service=createApplicationService({api,store,history});
  return {api,store,history,service};
}

test('纯 history 栈支持 commit → undo → redo，并在新提交后清空 redo',()=>{
  const history=createCommandHistory({limit:2,idFactory:(()=>{let i=0;return()=>`t${++i}`;})(),now:()=>new Date('2026-08-17T00:00:00Z')});
  const before=emptyDatabase();
  const after=emptyDatabase();after.settings.companyName='A';
  const first=history.createTransaction({before,after,commands:[{type:'database.replace'}],actor:{id:'u1'}});
  history.commit(first);
  assert.equal(history.status().canUndo,true);
  assert.equal(history.peekUndo().id,'t1');
  history.completeUndo();
  assert.equal(history.status().canRedo,true);
  history.completeRedo();
  assert.equal(history.status().canUndo,true);
  history.completeUndo();
  const second=history.createTransaction({before,after,commands:[{type:'database.replace'}]});
  history.commit(second);
  assert.equal(history.status().canRedo,false);
  assert.equal(history.status().undoCount,1);
});

test('审计记录只保存事务元数据，不保存 before/after 数据库快照',()=>{
  const db=emptyDatabase();
  const tx={id:'tx-1',label:'测试事务',source:'commands',actor:{id:'u1',displayName:'甲'},commandTypes:['assignment.assign'],commandCount:2};
  const audited=appendCommandAudit(db,{transaction:tx,action:'commit',at:new Date('2026-08-17T10:00:00Z')});
  const item=audited.activity[0];
  assert.equal(item.type,'command-audit');
  assert.equal(item.transactionId,'tx-1');
  assert.equal(item.commandCount,2);
  assert.equal(item.actor,'甲');
  assert.equal('before' in item,false);
  assert.equal('after' in item,false);
  assert.doesNotMatch(JSON.stringify(item),/projects/);
});

test('单命令 dispatch 形成可撤销事务，并持久记录 commit / undo / redo',async()=>{
  const {api,store,service}=serviceFixture();
  const command={type:'assignment.assign',payload:{projectId:'p1',personId:'u1',role:'视频制作人员',allocation:40,startDate:'2026-08-17'}};
  const result=await service.dispatch(command,{now:new Date('2026-08-17T10:00:00+08:00')});
  assert.equal(result.ok,true);
  assert.equal(store.getDatabase().assignments.length,1);
  assert.equal(service.historyStatus().undoCount,1);
  assert.equal(service.auditTrail()[0].action,'commit');

  const undone=await service.undo({now:new Date('2026-08-17T10:05:00+08:00')});
  assert.equal(undone.ok,true);
  assert.equal(store.getDatabase().assignments.length,0);
  assert.equal(service.historyStatus().canRedo,true);
  assert.equal(service.auditTrail()[0].action,'undo');

  const redone=await service.redo({now:new Date('2026-08-17T10:10:00+08:00')});
  assert.equal(redone.ok,true);
  assert.equal(store.getDatabase().assignments.length,1);
  assert.equal(service.auditTrail()[0].action,'redo');
  assert.deepEqual(service.auditTrail().slice(0,3).map(item=>item.action),['redo','undo','commit']);
  assert.equal(api.calls.filter(call=>call==='save').length,3);
});

test('dispatchMany 作为一个事务撤销，一次恢复整组排期',async()=>{
  const {store,service}=serviceFixture();
  const commands=[
    {type:'assignment.assign',payload:{projectId:'p1',personId:'u1',role:'视频制作人员',allocation:30,startDate:'2026-08-17'}},
    {type:'assignment.assign',payload:{projectId:'p1',personId:'u2',role:'视频制作人员',allocation:40,startDate:'2026-08-17'}}
  ];
  const result=await service.dispatchMany(commands,{label:'自动排期草案'});
  assert.equal(result.ok,true);
  assert.equal(store.getDatabase().assignments.length,2);
  assert.equal(service.historyStatus().undoCount,1);
  assert.equal(service.historyStatus().nextUndo.commandCount,2);
  assert.equal(service.historyStatus().nextUndo.label,'自动排期草案');
  await service.undo();
  assert.equal(store.getDatabase().assignments.length,0);
  await service.redo();
  assert.equal(store.getDatabase().assignments.length,2);
});

test('命令校验失败不会进入历史，也不会生成 command audit',async()=>{
  const {service}=serviceFixture();
  const result=await service.dispatch({type:'assignment.assign',payload:{projectId:'p1',personId:'missing',role:'视频制作人员',allocation:40}});
  assert.equal(result.ok,false);
  assert.equal(service.historyStatus().undoCount,0);
  assert.equal(service.auditTrail().length,0);
});

test('磁盘保存失败时事务不入历史且 Store 保持原状',async()=>{
  const {api,store,service}=serviceFixture();
  api.failSave();
  const result=await service.dispatch({type:'assignment.assign',payload:{projectId:'p1',personId:'u1',role:'视频制作人员',allocation:40}});
  assert.equal(result.ok,false);
  assert.equal(result.code,'PERSIST_FAILED');
  assert.equal(store.getDatabase().assignments.length,0);
  assert.equal(service.historyStatus().undoCount,0);
  assert.equal(service.auditTrail().length,0);
});

test('Undo 保存失败不移动历史栈，稍后仍可再次撤销',async()=>{
  const {api,store,service}=serviceFixture();
  await service.dispatch({type:'assignment.assign',payload:{projectId:'p1',personId:'u1',role:'视频制作人员',allocation:40}});
  api.failSave();
  const failed=await service.undo();
  assert.equal(failed.ok,false);
  assert.equal(store.getDatabase().assignments.length,1);
  assert.equal(service.historyStatus().undoCount,1);
  assert.equal(service.historyStatus().redoCount,0);
  const success=await service.undo();
  assert.equal(success.ok,true);
  assert.equal(store.getDatabase().assignments.length,0);
});

test('撤销后执行新命令会清空 redo 分支',async()=>{
  const {service}=serviceFixture();
  await service.dispatch({type:'assignment.assign',payload:{projectId:'p1',personId:'u1',role:'A',allocation:20}});
  await service.undo();
  assert.equal(service.historyStatus().canRedo,true);
  await service.dispatch({type:'assignment.assign',payload:{projectId:'p1',personId:'u2',role:'B',allocation:30}});
  assert.equal(service.historyStatus().canRedo,false);
  assert.equal((await service.redo()).code,'REDO_EMPTY');
});

test('replaceDatabase 也可作为一个事务撤销，并可选择不记录历史',async()=>{
  const {store,service}=serviceFixture();
  const replacement=seededDb();replacement.settings.companyName='新公司';
  await service.replaceDatabase(replacement,{label:'更新规划设置',syncAccounts:false});
  assert.equal(store.getDatabase().settings.companyName,'新公司');
  assert.equal(service.historyStatus().undoCount,1);
  await service.undo();
  assert.equal(store.getDatabase().settings.companyName,'');

  const another=seededDb();another.settings.companyName='恢复备份';
  await service.replaceDatabase(another,{recordHistory:false,syncAccounts:false});
  assert.equal(store.getDatabase().settings.companyName,'恢复备份');
  assert.equal(service.historyStatus().undoCount,0);
});

test('load 会清空当前会话 Undo/Redo，但持久审计仍从数据库读取',async()=>{
  const {service}=serviceFixture();
  await service.dispatch({type:'assignment.assign',payload:{projectId:'p1',personId:'u1',role:'视频制作人员',allocation:20}});
  assert.equal(service.historyStatus().undoCount,1);
  assert.equal(service.auditTrail().length,1);
  await service.load();
  assert.equal(service.historyStatus().undoCount,0);
  assert.equal(service.historyStatus().redoCount,0);
  assert.equal(service.auditTrail().length,1);
});

test('restoreSnapshotPreservingAudit 恢复业务数据但保留当前审计时间线',()=>{
  const before=seededDb();
  const current=seededDb();
  current.assignments.push({id:'a1',projectId:'p1',personId:'u1'});
  current.activity=[{id:'audit-1',type:'command-audit'}];
  const restored=restoreSnapshotPreservingAudit(before,current);
  assert.equal(restored.assignments.length,0);
  assert.deepEqual(restored.activity,current.activity);
  assert.deepEqual(commandAuditTrail(restored),current.activity);
});
