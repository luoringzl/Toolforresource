import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import authModule from '../electron/auth.cjs';

const {createAuthService,roleForPerson}=authModule;

test('总经理或 PM 自动获得调度权限，其余人员为只读',()=>{
  assert.equal(roleForPerson({positions:['导演','项目经理 / PM']}),'manager');
  assert.equal(roleForPerson({positions:['总经理']}),'manager');
  assert.equal(roleForPerson({positions:['AI动画师']}),'viewer');
});

test('本地账号支持初始化、人员同步、改密和管理员维护',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'resource-auth-'));
  try{
    const service=createAuthService(path.join(dir,'auth.json'));
    const setup=service.status().setupCredentials;
    assert.equal(setup.username,'admin');
    assert.ok(setup.password.length>=10);
    const admin=service.login(setup.username,setup.password);
    assert.equal(admin.ok,true);
    assert.equal(admin.user.role,'admin');
    const synced=service.syncPeople([{id:'p1',name:'张PM',positions:['项目经理 / PM']},{id:'p2',name:'李动画',positions:['AI动画师']}]);
    assert.equal(synced.created.length,2);
    service.logout();
    const managerPassword=synced.created.find(item=>item.username==='张PM').password;
    const manager=service.login('张PM',managerPassword);
    assert.equal(manager.user.role,'manager');
    assert.equal(manager.user.mustChangePassword,true);
    assert.equal(service.changePassword(managerPassword,'new-pass-01').ok,true);
    service.logout();
    assert.equal(service.login('张PM','new-pass-01').ok,true);
  } finally {
    fs.rmSync(dir,{recursive:true,force:true});
  }
});
