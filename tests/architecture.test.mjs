import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserAPI } from '../src/services/browser-api.mjs';
import { createLocalDatabaseRepository } from '../src/repositories/local-database.mjs';
import { localDateKey, localDateTimeStamp } from '../src/utils/date.mjs';

function memoryStorage(initial={}) {
  const values=new Map(Object.entries(initial));
  return {
    getItem:key=>values.has(key)?values.get(key):null,
    setItem:(key,value)=>values.set(key,String(value))
  };
}

test('V1.9 浏览器平台适配器提供与桌面端一致的基础数据接口', async()=>{
  const storage=memoryStorage();
  const api=createBrowserAPI({storage,documentRef:null,urlRef:null});
  const auth=await api.authStatus();
  assert.equal(auth.authenticated,true);
  assert.equal(auth.user.role,'admin');
  const empty=await api.loadData();
  assert.equal(empty.version,6);
  empty.projects.push({id:'p1',name:'模块化测试'});
  assert.equal((await api.saveData(empty)).ok,true);
  assert.equal((await api.loadData()).projects[0].name,'模块化测试');
});

test('浏览器平台适配器可独立更新人员头像数据',async()=>{
  const storage=memoryStorage();
  const api=createBrowserAPI({storage,documentRef:null,urlRef:null});
  const db=await api.loadData();
  db.people.push({id:'u1',name:'测试人员'});
  await api.saveData(db);
  assert.equal((await api.updatePersonAvatar('u1','data:image/png;base64,AA==')).ok,true);
  assert.equal((await api.loadData()).people[0].avatarData,'data:image/png;base64,AA==');
  assert.equal((await api.updatePersonAvatar('missing','')).ok,false);
});

test('Repository 独立负责数据库读写、事务更新与损坏数据回退',()=>{
  const storage=memoryStorage();
  const repository=createLocalDatabaseRepository({storage});
  const db=repository.load();
  db.people.push({id:'u1',name:'Repository测试'});
  assert.equal(repository.save(db).ok,true);
  const result=repository.update(data=>{
    data.projects.push({id:'p1',name:'事务项目'});
    return {ok:true,changed:1};
  });
  assert.equal(result.changed,1);
  assert.equal(repository.load().projects[0].name,'事务项目');

  const broken=createLocalDatabaseRepository({storage:memoryStorage({'project-resource-db':'{broken'})});
  assert.equal(broken.load().version,6);
  assert.deepEqual(broken.load().projects,[]);
});

test('Repository 更新失败时不会写入未完成的数据变更',()=>{
  const storage=memoryStorage();
  const repository=createLocalDatabaseRepository({storage});
  repository.save({version:6,projects:[],people:[],assignments:[],staffingNeeds:[],activity:[],settings:{}});
  const result=repository.update(data=>{
    data.projects.push({id:'bad'});
    return {ok:false,error:'拒绝写入'};
  });
  assert.equal(result.ok,false);
  assert.equal(repository.load().projects.length,0);
});

test('统一本地日期工具不依赖 UTC 字符串截断',()=>{
  const value=new Date(2026,7,12,0,5,6);
  assert.equal(localDateKey(value),'2026-08-12');
  assert.equal(localDateTimeStamp(value),'2026-08-12 00:05:06');
  assert.equal(localDateKey('invalid-date'),'');
});
