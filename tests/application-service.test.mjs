import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDatabase } from '../src/core.mjs';
import { createAppStore } from '../src/state/app-store.mjs';
import { createApplicationService } from '../src/services/application-service.mjs';

function fakeApi(initial=emptyDatabase()){
  let data=structuredClone(initial);
  const calls=[];
  return {
    calls,
    async loadData(){calls.push('load');return structuredClone(data);},
    async saveData(next){calls.push('save');data=structuredClone(next);return {ok:true};},
    async syncPeopleAccounts(people){calls.push(`sync:${people.length}`);return {ok:true};},
    snapshot(){return structuredClone(data);}
  };
}

test('Application Service 统一 load → store 边界',async()=>{
  const db=emptyDatabase();db.projects.push({id:'p1',name:'已存在项目',status:'待启动'});
  const api=fakeApi(db);const store=createAppStore();const service=createApplicationService({api,store});
  await service.load();
  assert.equal(store.getDatabase().projects[0].name,'已存在项目');
  assert.deepEqual(api.calls,['load']);
});

test('Application Service dispatch 统一命令、持久化和账号 effect',async()=>{
  const db=emptyDatabase();const api=fakeApi(db);const store=createAppStore({database:db});const service=createApplicationService({api,store});
  const result=await service.dispatch({type:'person.upsert',payload:{values:{name:'新人员',position:'AI动画师',employmentStatus:'在岗'}}},{now:new Date('2026-08-12T12:00:00+08:00')});
  assert.equal(result.ok,true);
  assert.equal(store.getDatabase().people.length,1);
  assert.equal(api.snapshot().people.length,1);
  assert.deepEqual(api.calls,['save','sync:1']);
});

test('命令校验失败时不持久化也不改变 Store',async()=>{
  const db=emptyDatabase();const api=fakeApi(db);const store=createAppStore({database:db});const service=createApplicationService({api,store});
  const revision=store.getState().revision;
  const result=await service.dispatch({type:'project.upsert',payload:{values:{name:''}}});
  assert.equal(result.ok,false);
  assert.equal(api.calls.length,0);
  assert.equal(store.getState().revision,revision);
});

test('replaceDatabase 用于备份恢复时统一保存与账号 reconciliation',async()=>{
  const api=fakeApi();const store=createAppStore();const service=createApplicationService({api,store});
  const db=emptyDatabase();db.people.push({id:'u1',name:'恢复人员',employmentStatus:'在岗'});
  const result=await service.replaceDatabase(db);
  assert.equal(result.ok,true);
  assert.equal(store.getDatabase().people[0].name,'恢复人员');
  assert.deepEqual(api.calls,['save','sync:1']);
});
