import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { emptyDatabase, migrateDatabase } from '../src/core.mjs';
import { assertDatabase, CURRENT_DATABASE_VERSION, normalizeDatabase } from '../src/schema/database.mjs';
import { DEFAULT_PLANNING_SETTINGS, migrateToCurrentVersion, planningSettingsFromDatabase } from '../src/schema/migrations.mjs';

const require=createRequire(import.meta.url);
const electronDefaults=require('../electron/database-defaults.cjs');

test('当前数据库版本正式升级为 V7',()=>{
  const db=emptyDatabase();
  assert.equal(CURRENT_DATABASE_VERSION,7);
  assert.equal(db.version,7);
  assert.equal(db.meta.schemaVersion,7);
  assert.ok(Array.isArray(db.settings.planning.forecastHorizons));
  assert.deepEqual(db.settings.planning.forecastHorizons,[30,60,90]);
});

test('V6 数据无损迁移到 V7 并补齐 planning 设置',()=>{
  const legacy={
    version:6,
    projects:[{id:'p1',name:'旧项目',status:'制作中'}],
    people:[{id:'u1',name:'旧人员',function:'视频制作',capacity:80}],
    assignments:[{id:'a1',projectId:'p1',personId:'u1',role:'视频制作人员',allocation:40,status:'进行中'}],
    staffingNeeds:[],activity:[],
    settings:{companyName:'测试公司',warningDays:5,dictionaries:{departments:['自定义部']},customFields:{projects:[],people:[]}}
  };
  const db=migrateDatabase(legacy);
  assert.equal(db.version,7);
  assert.equal(db.projects[0].name,'旧项目');
  assert.equal(db.people[0].name,'旧人员');
  assert.equal(db.people[0].capacity,80);
  assert.equal(db.assignments[0].allocation,40);
  assert.equal(db.settings.companyName,'测试公司');
  assert.deepEqual(db.settings.dictionaries.departments,['自定义部']);
  assert.deepEqual(db.settings.planning.forecastHorizons,[30,60,90]);
  assert.ok(db.meta.migrations.includes('6->7'));
});

test('已有 planning 自定义值迁移时保留并规范化',()=>{
  const db=migrateToCurrentVersion({
    version:6,settings:{planning:{forecastHorizons:[90,30,30,15],workingDays:[5,1,1,3],maxPeoplePerNeed:6,maxAllocationChunk:70,minAllocationChunk:20}}
  });
  assert.deepEqual(db.settings.planning.forecastHorizons,[15,30,90]);
  assert.deepEqual(db.settings.planning.workingDays,[1,3,5]);
  assert.equal(db.settings.planning.maxPeoplePerNeed,6);
  assert.equal(db.settings.planning.maxAllocationChunk,70);
  assert.equal(db.settings.planning.minAllocationChunk,20);
});

test('V7 再次 normalize 不重复追加 migration 记录',()=>{
  const once=migrateToCurrentVersion({version:6,settings:{}});
  const twice=migrateToCurrentVersion(once);
  assert.deepEqual(twice.meta.migrations,['6->7']);
  assert.equal(twice.version,7);
});

test('高于当前版本的数据库拒绝静默降级',()=>{
  assert.throws(()=>migrateToCurrentVersion({version:99,settings:{}}),/高于当前支持版本/);
});

test('schema normalize 和 assert 输出完整 V7 结构',()=>{
  const db=normalizeDatabase({version:6,projects:[],people:[],assignments:[],staffingNeeds:[],activity:[],settings:{}});
  assert.equal(assertDatabase(db).version,7);
  assert.ok(db.settings.planning);
  assert.equal(planningSettingsFromDatabase(db).defaultGanttDays,DEFAULT_PLANNING_SETTINGS.defaultGanttDays);
});

test('Electron 与 renderer 使用同一个 V7 版本号和核心 planning 默认值',()=>{
  const electronDb=electronDefaults.emptyDatabase();
  assert.equal(electronDefaults.DB_VERSION,CURRENT_DATABASE_VERSION);
  assert.equal(electronDb.version,7);
  assert.equal(electronDb.meta.schemaVersion,7);
  assert.deepEqual(electronDb.settings.planning.forecastHorizons,DEFAULT_PLANNING_SETTINGS.forecastHorizons);
  assert.deepEqual(electronDb.settings.planning.workingDays,DEFAULT_PLANNING_SETTINGS.workingDays);
});
