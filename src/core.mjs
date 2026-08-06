export const PROJECT_STATUSES = ['待启动', '制作中', '资产制作中', '资产制作完成', '视频制作中', '视频制作完成', '反馈修改中', '待验收', '暂停', '已完成', '已取消'];
export const ACTIVE_PROJECT_STATUSES = ['制作中', '资产制作中', '资产制作完成', '视频制作中', '视频制作完成', '反馈修改中', '待验收'];
export const COMPLETED_PROJECT_STATUSES = ['已完成', '已完结', '已取消'];
export const NON_STAFFING_PROJECT_STATUSES = [...COMPLETED_PROJECT_STATUSES];

export const PROJECT_TYPES = ['测试项目', '正式合作项目'];
export const PRODUCTION_REQUIREMENTS = ['片段制作', '剧集制作', '全片制作'];
export const SETTLEMENT_STATUSES = ['损稿', '客户撤稿', '正常结算', '部分结算', '不结算'];
export const TEST_RESULTS = ['测试通过', '测试未通过', '转正式合作', '待定'];

export const REQUIRED_PROJECT_ROLES = [
  { key: 'director', label: '项目负责人/导演', function: '导演', stage: '统筹', required: true },
  { key: 'writerDirector', label: '编导', function: '编导', stage: '剧本', required: false },
  { key: 'pm', label: 'PM', function: '项目经理 PM', stage: '统筹' },
  { key: 'art', label: '美术监制', function: '美术监制', stage: '美术', required: 'withoutDirector' },
  { key: 'video', label: '视频制作人员', function: '视频制作', stage: '视频' },
  { key: 'asset', label: '资产制作人员', function: '资产制作', stage: '资产' }
];

export const DEPARTMENTS = ['AI项目组', 'UE引擎组', 'CG资产组', '导演组', '教培部门', '商务部门', 'AI后期组', '未分配'];
export const POSITIONS = ['总经理', '人事总监', '项目经理 / PM', 'AI动画师', '导演', 'UE蓝图动画师', 'UE场景设计师', 'AI后期', 'AI技术研究', 'CG资产师', '商务', '导演助理', '制片', '美术监制', '剪辑师', '技术支持', '其它'];
export const SKILL_OPTIONS = ['AI视频制作', 'AI资产制作', 'UE蓝图开发', 'UE场景制作', 'AI后期', '剪辑', 'AI转绘', '3D模型', '3D动作', '3D特效', 'AI特效', '分镜设计', '剧本分析', '项目管理'];
export const SKILL_LEVELS = ['专家', '高级', '中级', '初级', '学习中'];
export const EMPLOYMENT_STATUSES = ['在岗', '请假', '异动', '停薪留岗', '外包', '离职', '离岗'];
export const CAPABILITY_UNIT_SUGGESTIONS = {
  'AI视频制作': '分钟/天', 'AI资产制作': '张/天', 'UE蓝图开发': '天/条C级蓝图', 'UE场景制作': '场景/周',
  'AI后期': '分钟/天', '剪辑': '分钟/天', 'AI转绘': '张/天', '3D模型': '个/周', '3D动作': '条/天',
  '3D特效': '条/周', 'AI特效': '条/天', '分镜设计': '镜头/天', '剧本分析': '集/天', '项目管理': '项目/人'
};

export const DEFAULT_DICTIONARIES = {
  departments: DEPARTMENTS,
  positions: POSITIONS,
  skills: SKILL_OPTIONS,
  employmentStatuses: EMPLOYMENT_STATUSES,
  projectStatuses: PROJECT_STATUSES,
  projectTypes: PROJECT_TYPES,
  productionRequirements: PRODUCTION_REQUIREMENTS,
  settlementStatuses: SETTLEMENT_STATUSES,
  testResults: TEST_RESULTS
};

export const projectFields = [
  ['name', '项目名称', 'text', true], ['shortName', '项目简称', 'text'],
  ['priority', '优先级', 'select', false, ['P0 紧急', 'P1 高', 'P2 中', 'P3 低']],
  ['projectType', '项目类型', 'select', false, PROJECT_TYPES],
  ['productionRequirement', '制作要求', 'select', false, PRODUCTION_REQUIREMENTS],
  ['sceneCount', '场数', 'number'], ['episodeCount', '集数', 'number'], ['duration', '总时长', 'text'],
  ['settlementStatus', '结算情况', 'select', false, SETTLEMENT_STATUSES],
  ['testResult', '测试结果', 'select', false, TEST_RESULTS],
  ['status', '项目状态', 'select', false, PROJECT_STATUSES],
  ['orderDate', '接单时间', 'date'], ['startDate', '启动时间', 'date'], ['ddl', 'DDL', 'date'],
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
  ['svn', 'SVN', 'text'], ['formLink', '项目表单链接', 'text'],
  ['riskNote', '风险 / 阻塞', 'textarea'], ['notes', '备注', 'textarea']
];

export const peopleFields = [
  ['name', '人员姓名', 'text', true], ['department', '归属部门', 'select', true, DEPARTMENTS],
  ['position', '职位', 'select', true, POSITIONS], ['capacity', '标准总产能（%）', 'number'],
  ['releaseDate', '预计产能释放日期（选填）', 'date'], ['employmentStatus', '在岗状态', 'select', false, EMPLOYMENT_STATUSES],
  ['capability', '综合能力说明', 'textarea'], ['contact', '联系方式', 'text'], ['notes', '备注', 'textarea']
];

export const projectHeaders = [
  '项目名称','项目简称','优先级','项目类型','制作要求','场数','集数','总时长','结算情况','测试结果','项目概述','引入人员','接单时间','启动时间','客户企业','客户对接人','DDL','项目状态',
  '剧本','故事大纲','人物小传','目标参考','验收标准','美术参考','项目总进度','本月完成进度','上月进度','项目负责人/导演','编导','PM','美术监制',
  '视频制作人员','资产制作人员','资产制作进度','资产完成日期','视频制作进度','视频制作完成日期','内审情况','其它支持','SVN','项目表单链接','风险/阻塞','备注'
];

export const peopleHeaders = [
  '人员姓名','归属部门','职位','技能与等级','制作能力','AI项目及产能占用','其它部门项目及产能占用','标准总产能','预计产能释放日期','在岗状态','综合能力说明','联系方式','备注'
];

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyDatabase() {
  return { version: 6, projects: [], people: [], assignments: [], staffingNeeds: [], activity: [], settings: { companyName: '', warningDays: 7, dictionaries: {}, customFields: { projects: [], people: [] } } };
}

export function clampPercent(value) {
  const number = Number(value || 0);
  return Math.min(100, Math.max(0, Number.isFinite(number) ? number : 0));
}

export function parsePositions(value) {
  if (Array.isArray(value)) return [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))];
  return [...new Set(String(value || '').split(/[、,，;；|\n]+/).map(item => item.trim()).filter(Boolean))];
}

export function personPositions(person = {}) {
  const values = parsePositions(person.positions?.length ? person.positions : person.position);
  return values.length ? values : [legacyFunctionToPosition(person.function)];
}

export function positionToLegacyFunction(position = '') {
  const positions = parsePositions(position);
  if (positions.includes('导演')) return '导演';
  if (positions.some(value => ['AI动画师', 'AI后期', '剪辑师'].includes(value))) return '视频制作';
  if (positions.includes('CG资产师')) return '资产制作';
  if (positions.includes('项目经理 / PM')) return '项目经理 PM';
  if (positions.includes('美术监制')) return '美术监制';
  if (positions.some(value => ['UE蓝图动画师', 'UE场景设计师', 'AI技术研究', '技术支持'].includes(value))) return '技术支持';
  return positions[0] || '其它';
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
    const [name, allocation, role, endDate, assetCreated, assetOptimized, videoMinutes, highDifficultyMinutes, actualOutputNote] = item.split(/[|｜]/).map(part => part.trim());
    return { name, allocation:Number(allocation || 0), role:role || '', endDate:endDate || '', assetCreated:assetCreated||'', assetOptimized:assetOptimized||'', videoMinutes:videoMinutes||'', highDifficultyMinutes:highDifficultyMinutes||'', actualOutputNote:actualOutputNote||'' };
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
  const positions = parsePositions(person.positions?.length ? person.positions : (person.position || legacyFunctionToPosition(person.function)));
  const position = positions.join('、');
  const skillProfiles = parseSkillProfiles(person.skillProfiles?.length ? person.skillProfiles : person.skills, person.skillLevel || '中级');
  return {
    ...person,
    department: person.department || '未分配', positions, position, function: positionToLegacyFunction(positions),
    capacity: Number(person.capacity || 100), employmentStatus: person.employmentStatus || '在岗',
    avatarData: /^data:image\/(?:png|jpeg|webp);base64,/i.test(String(person.avatarData || '')) ? person.avatarData : '',
    skillProfiles, skills: skillProfiles.map(item => item.skill).join('、'),
    productionCapabilities: parseProductionCapabilities(person.productionCapabilities),
    externalAssignments: parseExternalAssignments(person.externalAssignments)
  };
}

export function migrateDatabase(data = {}) {
  const base = emptyDatabase();
  const settings = data.settings || {};
  const projects=(data.projects || []).map(project=>({
    ...project,
    projectType:project.projectType || '正式合作项目',
    productionRequirement:project.productionRequirement || '',
    sceneCount:project.sceneCount ?? '', episodeCount:project.episodeCount ?? '',
    settlementStatus:project.settlementStatus || '', startDate:project.startDate || '',
    testResult:(project.projectType || '正式合作项目') === '测试项目' ? project.testResult || '' : ''
  }));
  return { ...base, ...data, version:6, projects, assignments:data.assignments || [], staffingNeeds:data.staffingNeeds || [], activity:data.activity || [], settings:{...base.settings,...settings,dictionaries:{...base.settings.dictionaries,...(settings.dictionaries||{})},customFields:{...base.settings.customFields,...(settings.customFields||{})}}, people:(data.people || []).map(migratePerson) };
}

export function projectRequiresStaffing(project = {}) {
  return Boolean(project) && !NON_STAFFING_PROJECT_STATUSES.includes(project.status);
}

export function assignmentRoleKey(assignment = {}) {
  const role = String(assignment.role || '').replace(/\s+/g, '');
  const stage = String(assignment.stage || '');
  if (role.includes('导演') || role.includes('项目负责人')) return 'director';
  if (role.includes('编导')) return 'writerDirector';
  if (role.toUpperCase() === 'PM' || role.includes('项目经理')) return 'pm';
  if (role.includes('美术监制')) return 'art';
  if (role.includes('视频') || stage === '视频') return 'video';
  if (role.includes('资产') || stage === '资产') return 'asset';
  return '';
}

export function assignmentConsumesCapacity(db, assignment, today = new Date().toISOString().slice(0, 10)) {
  if (!assignment) return false;
  const project = db.projects.find(item => item.id === assignment.projectId);
  if (!project || !projectRequiresStaffing(project)) return false;
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
  // 预计释放日期仅用于排期参考。是否可排始终以在岗状态和所有有效项目的剩余产能为准。
  return Boolean(person) && person.employmentStatus === '在岗';
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

export function assignmentOutputSummary(db, assignment = {}) {
  const project=db.projects.find(item=>item.id===assignment.projectId);
  const roleKey=assignmentRoleKey(assignment);
  const parts=[];
  if(roleKey==='asset'){
    if(assignment.assetCreated!==''&&assignment.assetCreated!=null)parts.push(`资产制作 ${Number(assignment.assetCreated||0)} 个`);
    if(assignment.assetOptimized!==''&&assignment.assetOptimized!=null)parts.push(`资产优化 ${Number(assignment.assetOptimized||0)} 个`);
  }else if(roleKey==='video'){
    if(assignment.videoMinutes!==''&&assignment.videoMinutes!=null)parts.push(`视频制作 ${Number(assignment.videoMinutes||0)} 分钟`);
    if(assignment.highDifficultyMinutes!==''&&assignment.highDifficultyMinutes!=null)parts.push(`高难度镜头 ${Number(assignment.highDifficultyMinutes||0)} 分钟`);
  }else if(roleKey==='director'){
    parts.push(`负责整片${project?.duration?` ${project.duration}`:'（总时长未填写）'}`);
  }
  if(assignment.actualOutputNote)parts.push(assignment.actualOutputNote);
  return parts.join('；');
}

export function personProjectGroups(db, personId, today = new Date().toISOString().slice(0, 10)) {
  const groups=new Map();
  for(const item of personWorkloadBreakdown(db,personId,today)){
    const key=item.source==='AI项目库'?`ai:${item.projectId}`:`external:${item.department||''}:${item.name||item.id}`;
    if(!groups.has(key))groups.set(key,{key,source:item.source,projectId:item.projectId||'',name:item.name,department:item.department,active:false,roles:[],assignments:[],allocation:0,outputs:[]});
    const group=groups.get(key);group.active=group.active||item.active;group.assignments.push(item);
    if(item.role&&!group.roles.includes(item.role))group.roles.push(item.role);
    if(item.active)group.allocation+=Number(item.allocation||0);
    const output=assignmentOutputSummary(db,item);if(output&&!group.outputs.includes(output))group.outputs.push(output);
  }
  return [...groups.values()].sort((a,b)=>Number(b.active)-Number(a.active)||String(a.name||'').localeCompare(String(b.name||''),'zh-CN'));
}

export function personMatchesRole(person, role = '') {
  return personPositionMatchesRole(person, role) || personSkillMatchesRole(person, role);
}

function compactMatchText(value = '') {
  return String(value || '').replace(/[\s/]+/g, '').toUpperCase();
}

function isPmRole(role = '') {
  const query = compactMatchText(role);
  return query === 'PM' || query.includes('项目经理') || query.includes('项目管理');
}

export function personPositionMatchesRole(person, role = '') {
  if (!person || !role) return false;
  const positions = personPositions(person);
  if (isPmRole(role)) return positions.includes('项目经理 / PM');
  const aliases = {
    '项目负责人/导演':['导演'], '导演':['导演'],
    '视频制作人员':['AI动画师','AI后期','剪辑师'], '视频制作':['AI动画师','AI后期','剪辑师'],
    '资产制作人员':['CG资产师'], '资产制作':['CG资产师'],
    '美术监制':['美术监制','UE场景设计师'], '编导':['导演','导演助理']
  };
  const accepted = aliases[role] || [];
  if (accepted.some(value => positions.includes(value))) return true;
  const query = compactMatchText(role);
  return positions.some(position => compactMatchText(position) === query);
}

export function personSkillMatchesRole(person, role = '') {
  if (!person || !role || isPmRole(role)) return false;
  const skills = [...(person.skillProfiles || []).map(item => item.skill), ...String(person.skills || '').split(/[、,，;；|\n]+/)].filter(Boolean);
  const aliases = {
    '项目负责人/导演':['项目管理'], '导演':['项目管理'],
    '视频制作人员':['AI视频制作','AI后期','剪辑','AI转绘'], '视频制作':['AI视频制作','AI后期','剪辑','AI转绘'],
    '资产制作人员':['AI资产制作','3D模型','3D动作','3D特效'], '资产制作':['AI资产制作','3D模型','3D动作','3D特效'],
    '美术监制':['UE场景制作','AI资产制作'], '编导':['剧本分析','分镜设计']
  };
  const accepted = aliases[role] || [role];
  return accepted.some(value => skills.some(skill => compactMatchText(skill).includes(compactMatchText(value))));
}

export function rankedCandidates(db, role = '', today = new Date().toISOString().slice(0, 10)) {
  return db.people
    .filter(person => isPersonSchedulable(person, today))
    .map(person => {
      const available = personAvailable(db, person, today);
      const positionMatch = personPositionMatchesRole(person, role);
      const skillMatch = personSkillMatchesRole(person, role);
      let rank = 4;
      if (positionMatch && available > 0) rank = 0;
      else if (skillMatch) rank = 1;
      else if (positionMatch) rank = 2;
      else if (available > 0) rank = 3;
      return { person, available, remaining:personRemainingCapacity(db, person, today), positionMatch, skillMatch, rank };
    })
    .sort((a, b) => a.rank - b.rank || b.available - a.available || String(a.person.name || '').localeCompare(String(b.person.name || ''), 'zh-CN'));
}

const pinyinNameCollator = new Intl.Collator('zh-CN-u-co-pinyin', { sensitivity:'base', numeric:true });

export function comparePeopleDirectory(a = {}, b = {}) {
  const aiOnDuty = person => person.employmentStatus === '在岗' && /^(?:AI|人工智能)/i.test(String(person.department || '').trim());
  const priorityDifference = Number(aiOnDuty(b)) - Number(aiOnDuty(a));
  if (priorityDifference) return priorityDifference;
  return pinyinNameCollator.compare(String(a.name || ''), String(b.name || ''));
}

export function projectAssignments(db, projectId) {
  return db.assignments.filter(item => item.projectId === projectId && (item.status !== '已结束' || ['director', 'video'].includes(assignmentRoleKey(item))));
}

export function projectRoleCoverage(db, projectId) {
  const assignments = projectAssignments(db, projectId);
  const project = db.projects.find(item => item.id === projectId);
  const requiresStaffing = projectRequiresStaffing(project);
  const directorCovered=assignments.some(item=>assignmentRoleKey(item)==='director');
  return REQUIRED_PROJECT_ROLES.map(role => {
    const matched = assignments.filter(item => assignmentRoleKey(item) === role.key);
    const required=requiresStaffing && (role.required==='withoutDirector'?!directorCovered:role.required!==false);
    return { ...role, required, optional:!required, assignments: matched, count: matched.length, covered: matched.length > 0 };
  });
}

export function projectStaffingWarnings(db, project) {
  if (!projectRequiresStaffing(project)) return [];
  const coverage = projectRoleCoverage(db, project.id);
  const missing = coverage.filter(item => item.required && !item.covered);
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

function projectStatusSortGroup(status = '') {
  if (ACTIVE_PROJECT_STATUSES.includes(status)) return 0;
  if (status === '待启动') return 1;
  if (status === '暂停') return 2;
  if (COMPLETED_PROJECT_STATUSES.includes(status)) return 3;
  return 0;
}

function projectPriorityRank(priority = '') {
  const match = String(priority).toUpperCase().match(/P([0-3])/);
  return match ? Number(match[1]) : 4;
}

export function compareProjects(a = {}, b = {}) {
  const groupDifference = projectStatusSortGroup(a.status) - projectStatusSortGroup(b.status);
  if (groupDifference) return groupDifference;
  const priorityDifference = projectPriorityRank(a.priority) - projectPriorityRank(b.priority);
  if (priorityDifference) return priorityDifference;
  const orderDateDifference = String(a.orderDate || '9999-12-31').localeCompare(String(b.orderDate || '9999-12-31'));
  if (orderDateDifference) return orderDateDifference;
  const ddlDifference = String(a.ddl || '9999-12-31').localeCompare(String(b.ddl || '9999-12-31'));
  if (ddlDifference) return ddlDifference;
  return String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN');
}

export function needAllocated(db, need) {
  return db.assignments
    .filter(item => item.projectId === need.projectId && item.status !== '已结束')
    .filter(item => item.needId === need.id || item.role === need.role)
    .reduce((total, item) => total + Number(item.allocation || 0), 0);
}

export function dashboardMetrics(db) {
  const active = db.projects.filter(item => ACTIVE_PROJECT_STATUSES.includes(item.status));
  const risky = active.filter(item => ['risk', 'overdue'].includes(projectHealth(item).key) || projectStaffingWarnings(db, item).some(warning => warning.critical));
  const availablePeople = db.people.filter(item => isPersonSchedulable(item) && personAvailable(db, item) > 0);
  const averageProgress = active.length ? Math.round(active.reduce((sum, item) => sum + clampPercent(item.overallProgress), 0) / active.length) : 0;
  const openNeeds = db.staffingNeeds.filter(item => projectRequiresStaffing(db.projects.find(project => project.id === item.projectId)) && item.status !== '已满足' && needAllocated(db, item) < Number(item.requiredCapacity || 0));
  const coreRoleGaps = db.projects.filter(projectRequiresStaffing).reduce((total, project) => total + projectRoleCoverage(db, project.id).filter(role => role.required && !role.covered).length, 0);
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
  const projectType = row['项目类型'] || '正式合作项目';
  return {
    name: row['项目名称'], shortName: row['项目简称'], priority: row['优先级'] || 'P2 中', projectType, productionRequirement:row['制作要求']||'',
    sceneCount:row['场数']??'', episodeCount:row['集数']??'', scope: row['集数/场/镜头'], duration: row['总时长'], settlementStatus:row['结算情况']||'', testResult:projectType==='测试项目'?row['测试结果']||'':'',
    overview: row['项目概述'], orderDate: row['接单时间'], startDate:row['启动时间']||'', clientCompany: row['客户企业'], clientContact: row['客户对接人'], ddl: row['DDL'], status: row['项目状态'] || '待启动',
    script: row['剧本'], outline: row['故事大纲'], biographies: row['人物小传'], targetReference: row['目标参考'], acceptanceCriteria: row['验收标准'], artReference: row['美术参考'],
    overallProgress: clampPercent(row['项目总进度']), currentMonthProgress: clampPercent(row['本月完成进度']), previousMonthProgress: clampPercent(row['上月进度']),
    assetProgress: clampPercent(row['资产制作进度']), assetCompletionDate: row['资产完成日期'], videoProgress: clampPercent(row['视频制作进度']), videoCompletionDate: row['视频制作完成日期'],
    internalReview: row['内审情况'] || '未开始', svn: row['SVN'], formLink: row['项目表单链接'], riskNote: row['风险/阻塞'], notes: row['备注']
  };
}

export function normalizePersonRow(row) {
  const positions = parsePositions(row['职位'] || legacyFunctionToPosition(row['职能']));
  const skillProfiles = parseSkillProfiles(row['技能与等级'] || row['技能标签'], row['技术能力'] || '中级');
  const legacyProjectText = row['参与项目'];
  const aiProjectAllocations = parseProjectAllocations(row['AI项目及产能占用'] || legacyProjectText);
  return migratePerson({
    name: row['人员姓名'] || row['姓名'], department: row['归属部门'] || row['所属部门/团队'] || '未分配', positions, position:positions.join('、'),
    function: positionToLegacyFunction(positions), capability: row['综合能力说明'] || row['个人能力信息说明'] || '',
    capacity: Number(row['标准总产能'] || row['标准产能'] || 100), releaseDate: row['预计产能释放日期'] || row['产能释放日期'] || '',
    employmentStatus: row['在岗状态'] || '在岗', skillProfiles, productionCapabilities:parseProductionCapabilities(row['制作能力']),
    externalAssignments:parseExternalAssignments(row['其它部门项目及产能占用']), contact:row['联系方式'] || '', notes:row['备注'] || '', aiProjectAllocations
  });
}

export function roleColumns(row) {
  return [
    ['项目负责人/导演', '导演', '项目负责人 / 导演'], ['编导', '编导', '编导'], ['PM', '项目经理 PM', 'PM'], ['美术监制', '美术监制', '美术监制'],
    ['视频制作人员', '视频制作', '视频制作'], ['资产制作人员', '资产制作', '资产制作'], ['其它支持', '其它', '其它支持'], ['引入人员', '其它', '引入人员']
  ].flatMap(([column, fallbackFunction, role]) => splitNames(row[column]).map(name => ({ name, fallbackFunction, role })));
}
