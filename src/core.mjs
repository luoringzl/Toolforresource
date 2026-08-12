export * from './core-base.mjs';
import * as base from './core-base.mjs';
import { migrateToCurrentVersion } from './schema/migrations.mjs';

export function emptyDatabase() {
  return migrateToCurrentVersion(base.emptyDatabase());
}

export function localDateString(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizedBusinessDate(value) {
  if (!value) return localDateString();
  const text = String(value);
  const utcToday = new Date().toISOString().slice(0, 10);
  return text === utcToday ? localDateString() : text;
}

export function assignmentConsumesCapacity(db, assignment, today = localDateString()) {
  if (!assignment || assignment.status === '已取消') return false;
  today = normalizedBusinessDate(today);
  const project = db.projects.find(item => item.id === assignment.projectId);
  if (!project || !base.projectRequiresStaffing(project)) return false;
  const roleKey = base.assignmentRoleKey(assignment);
  if (['director', 'video'].includes(roleKey)) return true;
  const assetReleasedStatuses = ['资产制作完成', '视频制作中', '视频制作完成', '反馈修改中', '待验收'];
  const assetFinished = assetReleasedStatuses.includes(project.status) || base.clampPercent(project.assetProgress) >= 100 || Boolean(project.assetCompletionDate);
  if (roleKey === 'asset' && assetFinished) return false;
  return assignment.status !== '已结束' && (!assignment.endDate || assignment.endDate >= today);
}

export function externalAssignmentConsumesCapacity(assignment, today = localDateString()) {
  if (!assignment || ['已结束', '已取消'].includes(assignment.status)) return false;
  today = normalizedBusinessDate(today);
  return !assignment.endDate || assignment.endDate >= today;
}

export function personUsage(db, personId, today = localDateString()) {
  today = normalizedBusinessDate(today);
  const projectUsage = db.assignments
    .filter(item => item.personId === personId)
    .filter(item => assignmentConsumesCapacity(db, item, today))
    .reduce((total, item) => total + Number(item.allocation || 0), 0);
  const person = db.people.find(item => item.id === personId);
  const externalUsage = (person?.externalAssignments || [])
    .filter(item => externalAssignmentConsumesCapacity(item, today))
    .reduce((total, item) => total + Number(item.allocation || 0), 0);
  return projectUsage + externalUsage;
}

export function personRemainingCapacity(db, person, today = localDateString()) {
  if (!person) return 0;
  today = normalizedBusinessDate(today);
  return Number(person.capacity || 100) - personUsage(db, person.id, today);
}

export function isPersonSchedulable(person) {
  return Boolean(person) && person.employmentStatus === '在岗';
}

export function personAvailable(db, person, today = localDateString()) {
  today = normalizedBusinessDate(today);
  if (!isPersonSchedulable(person)) return 0;
  return Math.max(0, personRemainingCapacity(db, person, today));
}

export function personWorkloadBreakdown(db, personId, today = localDateString()) {
  today = normalizedBusinessDate(today);
  const person = db.people.find(item => item.id === personId);
  const ai = db.assignments.filter(item => item.personId === personId).map(item => {
    const project = db.projects.find(projectItem => projectItem.id === item.projectId);
    return { ...item, source:'AI项目库', name:project?.name || '项目已删除', department:'AI项目组', active:assignmentConsumesCapacity(db, item, today) };
  });
  const external = (person?.externalAssignments || []).map(item => ({ ...item, source:'其它部门', active:externalAssignmentConsumesCapacity(item, today) }));
  return [...ai, ...external];
}

export function personProjectGroups(db, personId, today = localDateString()) {
  today = normalizedBusinessDate(today);
  const groups = new Map();
  for (const item of personWorkloadBreakdown(db, personId, today)) {
    const key = item.source === 'AI项目库' ? `ai:${item.projectId}` : `external:${item.department || ''}:${item.name || item.id}`;
    if (!groups.has(key)) groups.set(key, { key, source:item.source, projectId:item.projectId || '', name:item.name, department:item.department, active:false, roles:[], assignments:[], allocation:0, outputs:[] });
    const group = groups.get(key);
    group.active = group.active || item.active;
    group.assignments.push(item);
    if (item.role && !group.roles.includes(item.role)) group.roles.push(item.role);
    if (item.active) group.allocation += Number(item.allocation || 0);
    const output = base.assignmentOutputSummary(db, item);
    if (output && !group.outputs.includes(output)) group.outputs.push(output);
  }
  return [...groups.values()].sort((a,b) => Number(b.active) - Number(a.active) || String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN'));
}

export function rankedCandidates(db, role = '', today = localDateString()) {
  today = normalizedBusinessDate(today);
  return db.people
    .filter(person => isPersonSchedulable(person))
    .map(person => {
      const available = personAvailable(db, person, today);
      const positionMatch = base.personPositionMatchesRole(person, role);
      const skillMatch = base.personSkillMatchesRole(person, role);
      let rank = 4;
      if (positionMatch && available > 0) rank = 0;
      else if (skillMatch) rank = 1;
      else if (positionMatch) rank = 2;
      else if (available > 0) rank = 3;
      return { person, available, remaining:personRemainingCapacity(db, person, today), positionMatch, skillMatch, rank };
    })
    .sort((a,b) => a.rank - b.rank || b.available - a.available || String(a.person.name || '').localeCompare(String(b.person.name || ''), 'zh-CN'));
}

export function projectAssignments(db, projectId) {
  return db.assignments.filter(item => item.projectId === projectId && item.status !== '已取消' && (item.status !== '已结束' || ['director', 'video'].includes(base.assignmentRoleKey(item))));
}

export function projectRoleCoverage(db, projectId) {
  const assignments = projectAssignments(db, projectId);
  const project = db.projects.find(item => item.id === projectId);
  const requiresStaffing = base.projectRequiresStaffing(project);
  const directorCovered = assignments.some(item => base.assignmentRoleKey(item) === 'director');
  return base.REQUIRED_PROJECT_ROLES.map(role => {
    const matched = assignments.filter(item => base.assignmentRoleKey(item) === role.key);
    const required = requiresStaffing && (role.required === 'withoutDirector' ? !directorCovered : role.required !== false);
    return { ...role, required, optional:!required, assignments:matched, count:matched.length, covered:matched.length > 0 };
  });
}

export function projectStaffingWarnings(db, project) {
  if (!base.projectRequiresStaffing(project)) return [];
  const coverage = projectRoleCoverage(db, project.id);
  const missing = coverage.filter(item => item.required && !item.covered);
  const warnings = [];
  if (project.status === '资产制作中' && missing.some(item => item.key === 'asset')) warnings.push({ key:'asset', critical:true, text:'当前处于资产制作中，请立即安排资产制作人员' });
  if (project.status === '视频制作中' && missing.some(item => item.key === 'video')) warnings.push({ key:'video', critical:true, text:'当前处于视频制作中，请立即安排视频制作人员' });
  const otherMissing = missing.filter(item => !warnings.some(warning => warning.key === item.key));
  if (otherMissing.length) warnings.push({ key:'required', critical:false, text:`核心岗位待补齐：${otherMissing.map(item => item.label).join('、')}` });
  return warnings;
}

export function needAllocated(db, need) {
  const siblings = (db.staffingNeeds || []).filter(item => item.projectId === need.projectId && item.role === need.role);
  const allowLegacyRoleFallback = siblings.length <= 1;
  return db.assignments
    .filter(item => item.projectId === need.projectId && !['已结束', '已取消'].includes(item.status))
    .filter(item => item.needId ? item.needId === need.id : (allowLegacyRoleFallback && item.role === need.role))
    .reduce((total, item) => total + Number(item.allocation || 0), 0);
}

export function reconcileStaffingNeedStatuses(db) {
  for (const need of db.staffingNeeds || []) {
    const project = (db.projects || []).find(item => item.id === need.projectId);
    if (!base.projectRequiresStaffing(project)) continue;
    const required = Number(need.requiredCapacity || 0);
    need.status = required > 0 && needAllocated(db, need) < required ? '待安排' : '已满足';
  }
  return db;
}

export function migrateDatabase(data = {}) {
  const migrated = migrateToCurrentVersion(base.migrateDatabase(data));
  reconcileStaffingNeedStatuses(migrated);
  return migrated;
}

export function dashboardMetrics(db) {
  reconcileStaffingNeedStatuses(db);
  const active = db.projects.filter(item => base.ACTIVE_PROJECT_STATUSES.includes(item.status));
  const risky = active.filter(item => ['risk', 'overdue'].includes(base.projectHealth(item).key) || projectStaffingWarnings(db, item).some(warning => warning.critical));
  const availablePeople = db.people.filter(item => isPersonSchedulable(item) && personAvailable(db, item) > 0);
  const averageProgress = active.length ? Math.round(active.reduce((sum, item) => sum + base.clampPercent(item.overallProgress), 0) / active.length) : 0;
  const openNeeds = db.staffingNeeds.filter(item => base.projectRequiresStaffing(db.projects.find(project => project.id === item.projectId)) && needAllocated(db, item) < Number(item.requiredCapacity || 0));
  const coreRoleGaps = db.projects.filter(base.projectRequiresStaffing).reduce((total, project) => total + projectRoleCoverage(db, project.id).filter(role => role.required && !role.covered).length, 0);
  return { active:active.length, risky:risky.length, availablePeople:availablePeople.length, averageProgress, openNeeds:openNeeds.length + coreRoleGaps };
}
