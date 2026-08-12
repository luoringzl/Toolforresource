import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import authModule from '../electron/auth.cjs';
import {
  emptyDatabase, assignmentConsumesCapacity, projectRoleCoverage, needAllocated,
  reconcileStaffingNeedStatuses, dashboardMetrics, localDateString
} from '../src/core.mjs';

const { createAuthService, roleForPerson } = authModule;

test('已取消的内部项目分工不占用产能，也不覆盖项目岗位', () => {
  const db = emptyDatabase();
  db.projects.push({ id:'p1', name:'项目一', status:'视频制作中' });
  db.assignments.push({ id:'a1', projectId:'p1', personId:'u1', role:'视频制作人员', stage:'视频', allocation:80, status:'已取消' });
  assert.equal(assignmentConsumesCapacity(db, db.assignments[0], '2026-08-12'), false);
  assert.equal(projectRoleCoverage(db, 'p1').find(item => item.key === 'video').covered, false);
});

test('同项目同角色存在多条用人需求时，只计算绑定当前 needId 的分工', () => {
  const db = emptyDatabase();
  db.projects.push({ id:'p1', name:'项目一', status:'制作中' });
  const first = { id:'n1', projectId:'p1', role:'视频制作', requiredCapacity:50, status:'待安排' };
  const second = { id:'n2', projectId:'p1', role:'视频制作', requiredCapacity:50, status:'待安排' };
  db.staffingNeeds.push(first, second);
  db.assignments.push({ id:'a1', projectId:'p1', personId:'u1', needId:'n1', role:'视频制作', allocation:50, status:'进行中' });
  assert.equal(needAllocated(db, first), 50);
  assert.equal(needAllocated(db, second), 0);
});

test('旧数据只有单条同角色需求时，仍兼容未填写 needId 的分工', () => {
  const db = emptyDatabase();
  db.projects.push({ id:'p1', name:'项目一', status:'制作中' });
  const need = { id:'n1', projectId:'p1', role:'视频制作', requiredCapacity:50, status:'待安排' };
  db.staffingNeeds.push(need);
  db.assignments.push({ id:'a1', projectId:'p1', personId:'u1', role:'视频制作', allocation:40, status:'进行中' });
  assert.equal(needAllocated(db, need), 40);
});

test('已满足需求在分工被移除后会自动恢复为待安排', () => {
  const db = emptyDatabase();
  db.projects.push({ id:'p1', name:'项目一', status:'制作中' });
  const need = { id:'n1', projectId:'p1', role:'视频制作', requiredCapacity:50, status:'已满足' };
  db.staffingNeeds.push(need);
  reconcileStaffingNeedStatuses(db);
  assert.equal(need.status, '待安排');
  assert.ok(dashboardMetrics(db).openNeeds > 0);
});

test('本地业务日期使用系统本地年月日而不是 UTC 截断', () => {
  const value = new Date(2026, 7, 12, 0, 30, 0);
  assert.equal(localDateString(value), '2026-08-12');
});

test('非在岗的总经理或 PM 不再自动获得调度权限', () => {
  assert.equal(roleForPerson({ positions:['项目经理 / PM'], employmentStatus:'离职' }), 'viewer');
  assert.equal(roleForPerson({ positions:['总经理'], employmentStatus:'异动' }), 'viewer');
});

test('人员离岗或从人员库移除后，对应登录账号自动停用', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resource-auth-hotfix-'));
  try {
    const service = createAuthService(path.join(dir, 'auth.json'));
    const setup = service.status().setupCredentials;
    service.login(setup.username, setup.password);
    const synced = service.syncPeople([{ id:'p1', name:'张PM', positions:['项目经理 / PM'], employmentStatus:'在岗' }]);
    const password = synced.created[0].password;
    service.logout();
    assert.equal(service.login('张PM', password).ok, true);
    service.logout();

    service.login(setup.username, setup.password);
    service.syncPeople([{ id:'p1', name:'张PM', positions:['项目经理 / PM'], employmentStatus:'离职' }]);
    service.logout();
    assert.equal(service.login('张PM', password).ok, false);

    service.login(setup.username, setup.password);
    service.syncPeople([]);
    service.logout();
    assert.equal(service.login('张PM', password).ok, false);
  } finally {
    fs.rmSync(dir, { recursive:true, force:true });
  }
});
