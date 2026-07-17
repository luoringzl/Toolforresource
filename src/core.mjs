export const PROJECT_STATUSES = ['待启动', '制作中', '资产制作中', '资产制作完成', '视频制作中', '视频制作完成', '反馈修改中', '待验收', '暂停', '已完成', '已取消'];

export const REQUIRED_PROJECT_ROLES = [
  { key: 'director', label: '项目负责人/导演', function: '导演', stage: '统筹' },
  { key: 'pm', label: 'PM', function: '项目经理 PM', stage: '统筹' },
  { key: 'art', label: '美术监制', function: '美术监制', stage: '美术' },
  { key: 'video', label: '视频制作人员', function: '视频制作', stage: '视频' },
  { key: 'asset', label: '资产制作人员', function: '资产制作', stage: '资产' }
];

export const DEPARTMENTS = ['AI项目组', 'UE引擎组', 'CG资产组', '导演组', '教培部门', '商务部门', 'AI后期组', '未分配'];
export const POSITIONS = ['AI动画师', '导演', 'UE蓝图动画师', 'UE场景设计师', 'AI后期', 'AI技术研究', 'CG资产师', '商务', '导演助理', '项目经理 / PM', '制片', '美术监制', '剪辑师', '技术支持', '其它'];
export const SKILL_OPTIONS = ['AI视频制作', 'AI资产制作', 'UE蓝图开发', 'UE场景制作', 'AI后期', '剪辑', 'AI转绘', '3D模型', '3D动作', '3D特效', 'AI特效', '分镜设计', '剧本分析', '项目管理'];
export const SKILL_LEVELS = ['专家', '高级', '中级', '初级', '学习中'];
export const EMPLOYMENT_STATUSES = ['在岗', '请假', '异动', '停薪留岗', '外包', '离岗'];
export const CAPABILITY_UNIT_SUGGESTIONS = {
  'AI视频制作': '分钟/天', 'AI资产制作': '张/天', 'UE蓝图开发': '天/条C级蓝图', 'UE场景制作': '场景/周',
  'AI后期': '分钟/天', '剪辑': '分钟/天', 'AI转绘': '张/天', '3D模型': '个/周', '3D动作': '条/天',
  '3D特效': '条/周', 'AI特效': '条/天', '分镜设计': '镜头/天', '剧本分析': '集/天', '项目管理': '项目/人'
};

export const projectFields = [
  ['name', '项目名称', 'text', true], ['shortName', '项目简称', 'text'],
  ['priority', '优先级', 'select', false, ['P0 紧急', 'P1 高', 'P2 中', 'P3 低']],
  ['scope', '集数 / 场 / 镜头', 'text'], ['duration', '总时长', 'text'],
  ['status', '项目状态', 'select', false, PROJECT_STATUSES],
  ['orderDate', '接单时间', 'date'], ['ddl', 'DDL', 'date'],
  ['clientCompany', '客户企业', 'text'], ['clientContact', '客户对接人', 'text'],
  ['overview', '项目概述', 'textarea'], ['script', '剧本', 'textarea'],
  ['outline', '故事大纲', 'textarea'], ['biographies', '人物小传', 'textarea'],
  ['targetReference', '目标参考', 'textarea'], ['acceptanceCriteria', '验收标准', 'textarea'],
  ['artReference', '美术参考', 'textarea'],
  ['overallProgress', '项目总进度（%）', 'number'],
  ['currentMonthProgress', '本月完成进度（%）', 'number'],
  ['previousMonthProgress', '上月进度（%）', 'number'],
  ['assetProgress', '资产制作进度（%）', 'number'], ['assetCompletionDate', '资产完成日期', 'date'],
  ['videoProgress', '视频制作进度（%）', 'number'], ['videoCompletionDate', '视频制作完成日期', 'date'],
  ['internalReview', '内审情况', 'select', false, ['未开始', '待审', '通过', '需修改']],
  ['svn', 'SVN', 'text'], ['projectAddress', '项目地址', 'text'], ['formLink', '项目表单链接', 'text'],
  ['riskNote', '风险 / 阻塞', 'textarea'], ['notes', '备注', 'textarea']
];

export const peopleFields = [
  ['name', '人员姓名', 'text', true], ['department', '归属部门', 'select', true, DEPARTMENTS],
  ['position', '职位', 'select', true, POSITIONS], ['capacity', '标准总产能（%）', 'number'],
  ['releaseDate', '产能释放日期', 'date'], ['employmentStatus', '在岗状态', 'select', false, EMPLOYMENT_STATUSES],
  ['capability', '综合能力说明', 'textarea'], ['contact', '联系方式', 'text'], ['notes', '备注', 'textarea']
];

export const projectHeaders = [
  '项目名称','项目简称','优先级','集数/场/镜头','总时长','项目概述','引入人员','接单时间','客户企业','客户对接人','DDL','项目状态',
  '剧本','故事大纲','人物小传','目标参考','验收标准','美术参考','项目总进度','本月完成进度','上月进度','项目负责人/导演','PM','美术监制',
  '视频制作人员','资产制作人员','资产制作进度','资产完成日期','视频制作进度','视频制作完成日期','内审情况','其它支持','SVN','项目地址','项目表单链接','风险/阻塞','备注'
];

export const peopleHeaders = [
  '人员姓名','归属部门','职位','技能与等级','制作能力','AI项目及产能占用','其它部门项目及产能占用','标准总产能','产能释放日期','在岗状态','综合能力说明','联系方式','备注'
];

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyDatabase() {
  return { version: 2, projects: [], people: [], assignments: [], staffingNeeds: [], activity: [], settings: { companyName: '', warningDays: 7 } };
}

export function clampPercent(value) {
  const number = Number(value || 0);
  return Math.min(100, Math.max(0, Number.isFinite(number) ? number : 0));
}

export function positionToLegacyFunction(position = '') {
  if (position === '导演') return '导演';
  if (['AI动画师', 'AI后期', '剪辑师'].includes(position)) return '视频制作';
  if (position === 'CG资产师') return '资产制作';
  if (position === '项目经理 / PM') return '项目经理 PM';
  if (position === '美术监制') return '美术监制';
  if (['UE蓝图动画师', 'UE场景设计师', 'AI技术研究', '技术支持'].includes(position)) return '技术支持';
  return position || '其它';
}

export function legacyFunctionToPosition(value = '') {
  const mapping = { '视频制作':'AI动画师', '资产制作':'CG资产师', '项目经理 PM':'项目经理 / PM', '剪辑':'剪辑师' };
  return POSITIONS.includes(value) ? value : mapping[value] || value || '其它';
}

export function parseSkillProfiles(value, fallbackLevel = '中级') {
  if (Array.isArray(value)) return value.filter(item => item?.skill).map(item => ({ skill: item.skill, level: item.level || fallbackLevel }));
  return String(value || '').split(/[、,，;；\n]+/).map(item => item.trim()).filter(Boolean).map(item => {
    const [skill, level] = item.split(/[|｜:：]/).map(part => part.trim());
    return { skill, level: level || fallbackLevel };
  });
}

export function parseProductionCapabilities(value) {
  if (Array.isArray(value)) return value.filter(item => item?.skill).map(item => ({ skill:item.skill, quantity:String(item.quantity || ''), unit:item.unit || '', complexity:item.complexity || '', note:item.note || '' }));
  return String(value || '').split(/[；;\n]+/).map(item => item.trim()).filter(Boolean).map(item => {
    const [skill, quantity, unit, complexity, note] = item.split(/[|｜]/).map(part => part.trim());
    return { skill, quantity: quantity || '', unit: unit || '', complexity: complexity || '', note: note || '' };
  });
}

export function parseProjectAllocations(value) {
  return String(value || '').split(/[、；;\n]+/).map(item => item.trim()).filter(Boolean).map(item => {
    const [name, allocation, role, endDate] = item.split(/[|｜]/).map(part => part.trim());
    return { name, allocation:Number(allocation || 0), role:role || '', endDate:endDate || '' };
  });
}

export function parseExternalAssignments(value) {
  if (Array.isArray(value)) return value.filter(item => item?.name).map(item => ({ ...item, allocation:Number(item.allocation || 0) }));
  return String(value || '').split(/[；;\n]+/).map(item => item.trim()).filter(Boolean).map(item => {
    const [name, department, allocation, role, endDate] = item.split(/[|｜]/).map(part => part.trim());
    return { id:uid('ext'), name, department:department || '其它部门', allocation:Number(allocation || 0), role:role || '', endDate:endDate || '', status:'进行中' };
  });
}

export function migratePerson(person = {}) {
  const position = person.position || legacyFunctionToPosition(person.function);
  const skillProfiles = parseSkillProfiles(person.skillProfiles?.length ? person.skillProfiles : person.skills, person.skillLevel || '中级');
  return {
    ...person,
    department: person.department || '未分配', position, function: person.function || positionToLegacyFunction(position),
    capacity: Number(person.capacity || 100), employmentStatus: person.employmentStatus || '在岗',
    skillProfiles, skills: skillProfiles.map(item => item.skill).join('、'),
    productionCapabilities: parseProductionCapabilities(person.productionCapabilities),
    externalAssignments: parseExternalAssignments(person.externalAssignments)
  };
}

export function migrateDatabase(data = {}) {
  const base = emptyDatabase();
  return { ...base, ...data, version:2, projects:data.projects || [], assignments:data.assignments || [], staffingNeeds:data.staffingNeeds || [], activity:data.activity || [], settings:{...base.settings,...(data.settings || {})}, people:(data.people || []).map(migratePerson) };
}

export function assignmentRoleKey(assignment = {}) {
  const role = String(assignment.role || '').replace(/\s+/g, '');
  const stage = String(assignment.stage || '');
  if (role.includes('导演') || role.includes('项目负责人')) return 'director';
  if (role.toUpperCase() === 'PM' || role.includes('项目经理')) return 'pm';
  if (role.includes('美术监制')) return 'art';
  if (role.includes('视频') || stage === '视频') return 'video';
  if (role.includes('资产') || stage === '资产') return 'asset';
  return '';
}

export function assignmentConsumesCapacity(db, assignment, today = new Date().toISOString().slice(0, 10)) {
  if (!assignment) return false;
  const project = db.projects.find(item => item.id === assignment.projectId);
  if (!project || ['已完成', '已取消'].includes(project.status)) return false;
  const roleKey = assignmentRoleKey(assignment);
  // 导演和视频制作人员跟随项目全周期，只有项目完成/取消或移出项目才释放。
  if (['director', 'video'].includes(roleKey)) return true;
  const assetReleasedStatuses = ['资产制作完成', '视频制作中', '视频制作完成', '反馈修改中', '待验收'];
  const assetFinished = assetReleasedStatuses.includes(project.status) || clampPercent(project.assetProgress) >= 100 || Boolean(project.assetCompletionDate);
  if (roleKey === 'asset' && assetFinished) return false;
  return assignment.status !== '已结束' && (!assignment.endDate || assignment.endDate >= today);
}

export function personUsage(db, personId, today = new Date().toISOString().slice(0, 10)) {
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

export function externalAssignmentConsumesCapacity(assignment, today = new Date().toISOString().slice(0, 10)) {
  if (!assignment || ['已结束', '已取消'].includes(assignment.status)) return false;
  return !assignment.endDate || assignment.endDate >= today;
}

export function personRemainingCapacity(db, person, today = new Date().toISOString().slice(0, 10)) {
  if (!person) return 0;
  return Number(person.capacity || 100) - personUsage(db, person.id, today);
}

export function isPersonSchedulable(person, today = new Date().toISOString().slice(0, 10)) {
  return Boolean(person) && person.employmentStatus === '在岗' && (!person.releaseDate || person.releaseDate <= today);
}

export function personAvailable(db, person, today = new Date().toISOString().slice(0, 10)) {
  if (!isPersonSchedulable(person, today)) return 0;
  return Math.max(0, personRemainingCapacity(db, person, today));
}

export function personWorkloadBreakdown(db, personId, today = new Date().toISOString().slice(0, 10)) {
  const person = db.people.find(item => item.id === personId);
  const ai = db.assignments.filter(item => item.personId === personId).map(item => {
    const project = db.projects.find(projectItem => projectItem.id === item.projectId);
    return { ...item, source:'AI项目库', name:project?.name || '项目已删除', department:'AI项目组', active:assignmentConsumesCapacity(db, item, today) };
  });
  const external = (person?.externalAssignments || []).map(item => ({ ...item, source:'其它部门', active:externalAssignmentConsumesCapacity(item, today) }));
  return [...ai, ...external];
}

export function personMatchesRole(person, role = '') {
  const query = String(role || '').replace(/\s+/g, '');
  if (!query) return false;
  const haystack = [person?.position, person?.function, ...(person?.skillProfiles || []).map(item => item.skill), person?.skills].join('|').replace(/\s+/g, '');
  if (haystack.includes(query) || query.includes(String(person?.position || '').replace(/\s+/g, ''))) return true;
  const aliases = {
    '项目负责人/导演':['导演','项目管理'], '视频制作人员':['AI动画师','AI视频制作','AI后期','剪辑'],
    '资产制作人员':['CG资产师','AI资产制作','3D模型'], 'PM':['项目经理','项目管理','制片'], '美术监制':['美术监制','UE场景设计师']
  };
  return (aliases[role] || []).some(value => haystack.includes(value));
}

export function projectAssignments(db, projectId) {
  return db.assignments.filter(item => item.projectId === projectId && (item.status !== '已结束' || ['director', 'video'].includes(assignmentRoleKey(item))));
}

export function projectRoleCoverage(db, projectId) {
  const assignments = projectAssignments(db, projectId);
  return REQUIRED_PROJECT_ROLES.map(role => {
    const matched = assignments.filter(item => assignmentRoleKey(item) === role.key);
    return { ...role, assignments: matched, count: matched.length, covered: matched.length > 0 };
  });
}

export function projectStaffingWarnings(db, project) {
  if (!project) return [];
  const coverage = projectRoleCoverage(db, project.id);
  const missing = coverage.filter(item => !item.covered);
  const warnings = [];
  if (project.status === '资产制作中' && missing.some(item => item.key === 'asset')) {
    warnings.push({ key: 'asset', critical: true, text: '当前处于资产制作中，请立即安排资产制作人员' });
  }
  if (project.status === '视频制作中' && missing.some(item => item.key === 'video')) {
    warnings.push({ key: 'video', critical: true, text: '当前处于视频制作中，请立即安排视频制作人员' });
  }
  const otherMissing = missing.filter(item => !warnings.some(warning => warning.key === item.key));
  if (otherMissing.length) warnings.push({ key: 'required', critical: false, text: `核心岗位待补齐：${otherMissing.map(item => item.label).join('、')}` });
  return warnings;
}

export function projectHealth(project, today = new Date()) {
  if (project.status === '已完成') return { key: 'done', label: '已完成' };
  if (project.status === '暂停') return { key: 'paused', label: '已暂停' };
  if (project.riskNote) return { key: 'risk', label: '有风险' };
  if (project.ddl) {
    const days = Math.ceil((new Date(`${project.ddl}T23:59:59`) - today) / 86400000);
    if (days < 0) return { key: 'overdue', label: '已逾期' };
    if (days <= 7 && clampPercent(project.overallProgress) < 90) return { key: 'risk', label: '临近 DDL' };
  }
  return { key: 'normal', label: '正常' };
}

export function needAllocated(db, need) {
  return db.assignments
    .filter(item => item.projectId === need.projectId && item.status !== '已结束')
    .filter(item => item.needId === need.id || item.role === need.role)
    .reduce((total, item) => total + Number(item.allocation || 0), 0);
}

export function dashboardMetrics(db) {
  const active = db.projects.filter(item => ['制作中', '资产制作中', '资产制作完成', '视频制作中', '视频制作完成', '反馈修改中', '待验收'].includes(item.status));
  const risky = active.filter(item => ['risk', 'overdue'].includes(projectHealth(item).key) || projectStaffingWarnings(db, item).some(warning => warning.critical));
  const availablePeople = db.people.filter(item => item.employmentStatus !== '离岗' && personAvailable(db, item) > 0);
  const averageProgress = active.length ? Math.round(active.reduce((sum, item) => sum + clampPercent(item.overallProgress), 0) / active.length) : 0;
  const openNeeds = db.staffingNeeds.filter(item => item.status !== '已满足' && needAllocated(db, item) < Number(item.requiredCapacity || 0));
  const coreRoleGaps = db.projects.filter(item => !['已完成', '已取消'].includes(item.status)).reduce((total, project) => total + projectRoleCoverage(db, project.id).filter(role => !role.covered).length, 0);
  return { active: active.length, risky: risky.length, availablePeople: availablePeople.length, averageProgress, openNeeds: openNeeds.length + coreRoleGaps };
}

export function splitNames(value) {
  return String(value || '').split(/[、,，;；/\n]+/).map(item => item.trim()).filter(Boolean);
}

export function uniqueName(base, existingNames) {
  if (!existingNames.includes(base)) return base;
  let index = 2;
  while (existingNames.includes(`${base} (${index})`)) index += 1;
  return `${base} (${index})`;
}

export function normalizeProjectRow(row) {
  return {
    name: row['项目名称'], shortName: row['项目简称'], priority: row['优先级'] || 'P2 中', scope: row['集数/场/镜头'], duration: row['总时长'],
    overview: row['项目概述'], orderDate: row['接单时间'], clientCompany: row['客户企业'], clientContact: row['客户对接人'], ddl: row['DDL'], status: row['项目状态'] || '待启动',
    script: row['剧本'], outline: row['故事大纲'], biographies: row['人物小传'], targetReference: row['目标参考'], acceptanceCriteria: row['验收标准'], artReference: row['美术参考'],
    overallProgress: clampPercent(row['项目总进度']), currentMonthProgress: clampPercent(row['本月完成进度']), previousMonthProgress: clampPercent(row['上月进度']),
    assetProgress: clampPercent(row['资产制作进度']), assetCompletionDate: row['资产完成日期'], videoProgress: clampPercent(row['视频制作进度']), videoCompletionDate: row['视频制作完成日期'],
    internalReview: row['内审情况'] || '未开始', svn: row['SVN'], projectAddress: row['项目地址'], formLink: row['项目表单链接'], riskNote: row['风险/阻塞'], notes: row['备注']
  };
}

export function normalizePersonRow(row) {
  const position = row['职位'] || legacyFunctionToPosition(row['职能']);
  const skillProfiles = parseSkillProfiles(row['技能与等级'] || row['技能标签'], row['技术能力'] || '中级');
  const legacyProjectText = row['参与项目'];
  const aiProjectAllocations = parseProjectAllocations(row['AI项目及产能占用'] || legacyProjectText);
  return migratePerson({
    name: row['人员姓名'] || row['姓名'], department: row['归属部门'] || row['所属部门/团队'] || '未分配', position,
    function: positionToLegacyFunction(position), capability: row['综合能力说明'] || row['个人能力信息说明'] || '',
    capacity: Number(row['标准总产能'] || row['标准产能'] || 100), releaseDate: row['产能释放日期'] || '',
    employmentStatus: row['在岗状态'] || '在岗', skillProfiles, productionCapabilities:parseProductionCapabilities(row['制作能力']),
    externalAssignments:parseExternalAssignments(row['其它部门项目及产能占用']), contact:row['联系方式'] || '', notes:row['备注'] || '', aiProjectAllocations
  });
}

export function roleColumns(row) {
  return [
    ['项目负责人/导演', '导演', '项目负责人 / 导演'], ['PM', '项目经理 PM', 'PM'], ['美术监制', '美术监制', '美术监制'],
    ['视频制作人员', '视频制作', '视频制作'], ['资产制作人员', '资产制作', '资产制作'], ['其它支持', '其它', '其它支持'], ['引入人员', '其它', '引入人员']
  ].flatMap(([column, fallbackFunction, role]) => splitNames(row[column]).map(name => ({ name, fallbackFunction, role })));
}
