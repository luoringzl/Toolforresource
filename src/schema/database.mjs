import { emptyDatabase, migrateDatabase } from '../core.mjs';

export const CURRENT_DATABASE_VERSION = 6;

export function databaseShapeErrors(value) {
  const errors=[];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['数据库必须是对象'];
  for (const key of ['projects','people','assignments','staffingNeeds','activity']) {
    if (!Array.isArray(value[key])) errors.push(`${key} 必须是数组`);
  }
  if (!value.settings || typeof value.settings !== 'object' || Array.isArray(value.settings)) errors.push('settings 必须是对象');
  return errors;
}

export function normalizeDatabase(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyDatabase();
  return migrateDatabase(value);
}

export function assertDatabase(value) {
  const normalized=normalizeDatabase(value);
  const errors=databaseShapeErrors(normalized);
  if (errors.length) throw new Error(`数据库结构无效：${errors.join('；')}`);
  if (Number(normalized.version) !== CURRENT_DATABASE_VERSION) throw new Error(`数据库版本不受支持：${normalized.version}`);
  return normalized;
}

export function cloneDatabase(value) {
  const normalized=normalizeDatabase(value);
  return typeof structuredClone === 'function'
    ? structuredClone(normalized)
    : JSON.parse(JSON.stringify(normalized));
}
