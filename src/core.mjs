export const projectFields = [
  ['name', '项目名称', 'text', true], ['shortName', '项目简称', 'text'],
  ['priority', '优先级', 'select', false, ['P0 紧急', 'P1 高', 'P2 中', 'P3 低']],
  ['scope', '集数 / 场 / 镜头', 'text'], ['duration', '总时长', 'text'],
  ['status', '项目状态', 'select', false, ['待启动', '制作中', '暂停', '待验收', '已完成', '已取消']],
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
  ['name', '姓名', 'text', true], ['department', '所属部门 / 团队', 'text'],
  ['function', '职能', 'select', true, ['导演', '项目经理 PM', '美术监制', '资产制作', '视频制作', '编剧', '剪辑', '技术支持', '其它']],
  ['skillLevel', '技术能力', 'select', false, ['专家', '高级', '中级', '初级', '待补充']],
  ['capability', '个人能力信息说明', 'textarea'], ['skills', '技能标签（顿号分隔）', 'text'],
  ['capacity', '标准产能（%）', 'number'], ['releaseDate', '产能释放日期', 'date'],
  ['employmentStatus', '在岗状态', 'select', false, ['在岗', '请假', '外包', '离岗']],
  ['contact', '联系方式', 'text'], ['notes', '备注', 'textarea']
];

export const projectHeaders = [
  '项目名称','项目简称','优先级','集数/场/镜头','总时长','项目概述','引入人员','接单时间','客户企业','客户对接人','DDL','项目状态',
  '剧本','故事大纲','人物小传','目标参考','验收标准','美术参考','项目总进度','本月完成进度','上月进度','项目负责人/导演','PM','美术监制',
  '视频制作人员','资产制作人员','资产制作进度','资产完成日期','视频制作进度','视频制作完成日期','内审情况','其它支持','SVN','项目地址','项目表单链接','风险/阻塞','备注'
];

export const peopleHeaders = [
  '姓名','所属部门/团队','职能','个人能力信息说明','标准产能','参与项目','产能释放日期','目前参与项目占据产能的百分比','在岗状态','技术能力','技能标签','联系方式','备注'
];

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyDatabase() {
  return { version: 1, projects: [], people: [], assignments: [], staffingNeeds: [], activity: [], settings: { companyName: '', warningDays: 7 } };
}

export function clampPercent(value) {
  const number = Number(value || 0);
  return Math.min(100, Math.max(0, Number.isFinite(number) ? number : 0));
}

export function personUsage(db, personId, today = new Date().toISOString().slice(0, 10)) {
  return db.assignments
    .filter(item => item.personId === personId)
    .filter(item => item.status !== '已结束')
    .filter(item => !item.endDate || item.endDate >= today)
    .filter(item => {
      const project = db.projects.find(project => project.id === item.projectId);
      return project && !['已完成', '已取消'].includes(project.status);
    })
    .reduce((total, item) => total + Number(item.allocation || 0), 0);
}

export function personAvailable(db, person) {
  if (!person || person.employmentStatus === '离岗') return 0;
  return Math.max(0, Number(person.capacity || 100) - personUsage(db, person.id));
}

export function projectAssignments(db, projectId) {
  return db.assignments.filter(item => item.projectId === projectId && item.status !== '已结束');
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
  const active = db.projects.filter(item => ['制作中', '待验收'].includes(item.status));
  const risky = active.filter(item => ['risk', 'overdue'].includes(projectHealth(item).key));
  const availablePeople = db.people.filter(item => item.employmentStatus !== '离岗' && personAvailable(db, item) > 0);
  const averageProgress = active.length ? Math.round(active.reduce((sum, item) => sum + clampPercent(item.overallProgress), 0) / active.length) : 0;
  const openNeeds = db.staffingNeeds.filter(item => item.status !== '已满足' && needAllocated(db, item) < Number(item.requiredCapacity || 0));
  return { active: active.length, risky: risky.length, availablePeople: availablePeople.length, averageProgress, openNeeds: openNeeds.length };
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
  return {
    name: row['姓名'], department: row['所属部门/团队'], function: row['职能'] || '其它', capability: row['个人能力信息说明'], capacity: clampPercent(row['标准产能'] || 100),
    releaseDate: row['产能释放日期'], employmentStatus: row['在岗状态'] || '在岗', skillLevel: row['技术能力'] || '中级', skills: row['技能标签'], contact: row['联系方式'], notes: row['备注']
  };
}

export function roleColumns(row) {
  return [
    ['项目负责人/导演', '导演', '项目负责人 / 导演'], ['PM', '项目经理 PM', 'PM'], ['美术监制', '美术监制', '美术监制'],
    ['视频制作人员', '视频制作', '视频制作'], ['资产制作人员', '资产制作', '资产制作'], ['其它支持', '其它', '其它支持'], ['引入人员', '其它', '引入人员']
  ].flatMap(([column, fallbackFunction, role]) => splitNames(row[column]).map(name => ({ name, fallbackFunction, role })));
}
