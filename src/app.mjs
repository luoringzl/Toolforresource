import {
  PROJECT_STATUSES, REQUIRED_PROJECT_ROLES, DEPARTMENTS, POSITIONS, SKILL_OPTIONS, SKILL_LEVELS, EMPLOYMENT_STATUSES, CAPABILITY_UNIT_SUGGESTIONS,
  projectFields, emptyDatabase, uid, clampPercent, personUsage, personAvailable, personRemainingCapacity, personWorkloadBreakdown, personMatchesRole,
  migrateDatabase, migratePerson, positionToLegacyFunction,
  assignmentConsumesCapacity, projectAssignments, projectRoleCoverage, projectStaffingWarnings,
  projectHealth, compareProjects, needAllocated, dashboardMetrics, splitNames, normalizeProjectRow, normalizePersonRow, roleColumns
} from './core.mjs';

const localAPI = {
  async loadData() {
    try { return JSON.parse(localStorage.getItem('project-resource-db')) || emptyDatabase(); }
    catch { return emptyDatabase(); }
  },
  async saveData(data) { localStorage.setItem('project-resource-db', JSON.stringify(data)); return { ok: true }; },
  async importSheet() { return { canceled: false, error: '请在 Windows 桌面软件中使用 Excel 导入功能' }; },
  async saveTemplate() { return { canceled: false, error: '请在 Windows 桌面软件中下载模板' }; },
  async exportBackup(data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = '项目人员调度台-备份.json'; link.click();
    return { canceled: false };
  },
  async importBackup() { return { canceled: false, error: '请在 Windows 桌面软件中恢复备份' }; },
  async openPath() { return ''; }
};

const api = window.desktopAPI || localAPI;
let db = emptyDatabase();
let currentView = 'dashboard';
const filters = { projects: '', projectStatus: '全部', people: '', peopleDepartment: '全部', peoplePosition: '全部' };

const titles = {
  dashboard: ['工作台', '总览面板'], projects: ['资料库', '项目资料库'], people: ['资料库', '人员资料库'],
  schedule: ['资源规划', '人员调度'], import: ['数据管理', '导入与模板'], settings: ['系统', '数据与设置']
};

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const esc = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
const today = () => new Date().toISOString().slice(0, 10);
const initials = name => String(name || '?').slice(-2);
const progress = value => `<div class="progress-label"><span>进度</span><strong>${clampPercent(value)}%</strong></div><div class="progress"><i style="width:${clampPercent(value)}%"></i></div>`;
const tag = (label, tone = '') => `<span class="tag ${tone}">${esc(label || '未设置')}</span>`;
const statusTone = status => status === '已完成' ? 'blue' : status === '暂停' ? 'paused' : status === '反馈修改中' ? 'orange' : ['制作中','资产制作中','视频制作中'].includes(status) ? 'green' : '';
const phaseProgress = (label,value,tone='mint') => `<div class="phase-progress"><div><span>${esc(label)}</span><strong>${clampPercent(value)}%</strong></div><div class="phase-track"><i class="${tone}" style="width:${clampPercent(value)}%"></i></div></div>`;

function logActivity(type, text) {
  db.activity = db.activity || [];
  db.activity.unshift({ id: uid('log'), type, text, at: new Date().toISOString() });
  db.activity = db.activity.slice(0, 80);
}

async function persist(message = '') {
  const result = await api.saveData(db);
  if (!result?.ok && result?.error) toast(result.error, true);
  if (message) toast(message);
}

function toast(message, error = false) {
  const node = document.createElement('div');
  node.className = `toast${error ? ' error' : ''}`;
  node.textContent = message;
  $('#toast-stack').append(node);
  setTimeout(() => node.remove(), 3200);
}

function setView(view) {
  currentView = view;
  $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === view));
  $$('.view').forEach(item => item.classList.toggle('active', item.id === `view-${view}`));
  $('#eyebrow').textContent = titles[view][0];
  $('#page-title').textContent = titles[view][1];
  renderView(view);
}

function renderView(view = currentView) {
  if (view === 'dashboard') renderDashboard();
  if (view === 'projects') renderProjects();
  if (view === 'people') renderPeople();
  if (view === 'schedule') renderSchedule();
  if (view === 'import') renderImport();
  if (view === 'settings') renderSettings();
}

function renderAll() {
  ['dashboard','projects','people','schedule','import','settings'].forEach(renderView);
}

function emptyBlock(icon, title, text, action = '') {
  return `<div class="empty"><div class="empty-icon">${icon}</div><strong>${title}</strong><p>${text}</p>${action}</div>`;
}

function peopleForProject(projectId) {
  return projectAssignments(db, projectId).map(item => ({ assignment: item, person: db.people.find(person => person.id === item.personId) })).filter(item => item.person);
}

function roleCoverageSummary(project) {
  const coverage = projectRoleCoverage(db, project.id);
  const covered = coverage.filter(item => item.covered).length;
  const missing = coverage.filter(item => !item.covered).map(item => item.label);
  return { coverage, covered, missing };
}

function compactRoleBoard(project, interactive = false) {
  return projectRoleCoverage(db,project.id).map(role=>{
    const names=role.assignments.map(assignment=>db.people.find(person=>person.id===assignment.personId)?.name).filter(Boolean);
    const attributes=interactive?`data-assign-role="${esc(role.label)}" data-project-id="${project.id}"`:'';
    return `<${interactive?'button':'div'} class="role-chip ${names.length?'filled':'missing'}" ${attributes}><span>${esc(role.label.replace('项目负责人/','').replace('人员',''))}</span><strong>${names.length?esc(names.join('、')):'＋ 待安排'}</strong></${interactive?'button':'div'}>`;
  }).join('');
}

function renderDashboard() {
  const root = $('#view-dashboard');
  const metrics = dashboardMetrics(db);
  const active = db.projects.filter(item => !['已完成','已取消'].includes(item.status)).sort((a,b) => (a.ddl || '9999').localeCompare(b.ddl || '9999')).slice(0, 6);
  const people = db.people.filter(item => item.employmentStatus !== '离岗'&&personAvailable(db,item)>0).sort((a,b) => personAvailable(db,b)-personAvailable(db,a)).slice(0,6);
  const gaps=db.projects.filter(project=>!['已完成','已取消'].includes(project.status)).flatMap(project=>projectRoleCoverage(db,project.id).filter(role=>!role.covered).map(role=>({project,role,critical:(project.status==='资产制作中'&&role.key==='asset')||(project.status==='视频制作中'&&role.key==='video')}))).sort((a,b)=>Number(b.critical)-Number(a.critical)).slice(0,5);
  root.innerHTML = `
    <div class="metrics">
      <div class="metric green"><div class="metric-label">进行中项目</div><div class="metric-value">${metrics.active}</div><div class="metric-note">覆盖资产、视频、反馈与验收阶段</div></div>
      <div class="metric blue"><div class="metric-label">平均项目进度</div><div class="metric-value">${metrics.averageProgress}<small>%</small></div><div class="metric-note">按进行中项目计算</div></div>
      <div class="metric orange"><div class="metric-label">待安排需求</div><div class="metric-value">${metrics.openNeeds}</div><div class="metric-note">仍存在人员缺口</div></div>
      <div class="metric red"><div class="metric-label">风险项目</div><div class="metric-value">${metrics.risky}</div><div class="metric-note">临期、逾期或有阻塞</div></div>
      <div class="metric violet"><div class="metric-label">可调度人员</div><div class="metric-value">${metrics.availablePeople}</div><div class="metric-note">剩余产能大于 0%</div></div>
    </div>
    <div class="dashboard-focus-grid">
      <div class="card project-control-card">
        <div class="card-head"><div><h3>项目进度控制</h3><p>总进度、资产和视频进度集中管理</p></div><button class="link-btn" data-go="projects">全部项目 →</button></div>
        <div class="project-control-list">${active.length?active.map(project=>{
          const health=projectHealth(project);const roles=roleCoverageSummary(project);
          return `<div class="project-control-item"><div class="control-project-head"><div><strong>${esc(project.name)}</strong><span>${tag(project.status,statusTone(project.status))} ${tag(health.label,health.key)}</span></div><div class="control-deadline"><span>DDL</span><strong>${esc(project.ddl||'未设置')}</strong></div></div><div class="phase-progress-grid">${phaseProgress('总进度',project.overallProgress)}${phaseProgress('资产',project.assetProgress,'blue')}${phaseProgress('视频',project.videoProgress,'violet')}</div><div class="control-team-line"><div class="role-chip-row">${compactRoleBoard(project,false)}</div><button class="btn btn-outline btn-sm" data-open-project="${project.id}">团队与进度</button></div>${roles.missing.length?`<div class="control-warning">待补岗位：${esc(roles.missing.join('、'))}</div>`:''}</div>`;
        }).join(''):emptyBlock('▦','还没有项目','新建项目后即可管理进度和团队。','<button class="btn btn-primary" data-action="new-project">新建项目</button>')}</div>
      </div>
      <div class="dashboard-side-stack">
        <div class="card staffing-card"><div class="card-head"><div><h3>优先人员安排</h3><p>先处理当前阶段冲突和核心岗位缺口</p></div><button class="link-btn" data-go="schedule">调度面板 →</button></div><div class="card-body gap-preview-list">${gaps.length?gaps.map(({project,role,critical})=>`<div class="gap-preview ${critical?'critical':''}"><div><strong>${esc(project.name)}</strong><span>${esc(project.status)} · ${esc(role.label)}</span></div><button class="btn ${critical?'btn-primary':'btn-outline'} btn-sm" data-assign-role="${esc(role.label)}" data-project-id="${project.id}">安排</button></div>`).join(''):emptyBlock('✓','核心岗位已齐','当前项目没有核心岗位缺口。')}</div></div>
        <div class="card available-card"><div class="card-head"><div><h3>可立即调度</h3><p>按所有有效项目汇总后的剩余产能排列</p></div><button class="link-btn" data-go="people">人员库 →</button></div><div class="card-body">${people.length?people.map(person=>{const used=personUsage(db,person.id),available=personAvailable(db,person);return `<div class="available-person"><div class="avatar-name"><i class="avatar">${esc(initials(person.name))}</i><div><strong>${esc(person.name)}</strong><span>${esc(person.position||person.function||'未设置职位')} · 已占 ${used}%</span></div></div><strong class="available-value">可用 ${available}%</strong><button class="icon-btn" title="分配" data-assign-person="${person.id}">＋</button></div>`}).join(''):emptyBlock('◎','暂无可用人员','当前所有在岗人员的剩余产能均为 0%。')}</div></div>
      </div>
    </div>`;
}

function renderProjects() {
  const root = $('#view-projects');
  const list = db.projects.filter(item => {
    const keyword = filters.projects.toLowerCase();
    return (!keyword || [item.name,item.shortName,item.clientCompany,item.clientContact].some(value => String(value || '').toLowerCase().includes(keyword))) && (filters.projectStatus === '全部' || item.status === filters.projectStatus);
  }).sort(compareProjects);
  root.innerHTML = `
    <div class="section-heading"><div><h2>全部项目</h2><p>共 ${db.projects.length} 个项目，人员信息通过分工记录双向关联</p></div></div>
    <div class="toolbar">
      <input class="searchbox" id="project-search" value="${esc(filters.projects)}" placeholder="搜索项目名、客户或对接人…">
      <select class="filter-select" id="project-status-filter">${['全部',...PROJECT_STATUSES].map(value => `<option ${filters.projectStatus===value?'selected':''}>${value}</option>`).join('')}</select>
      <div class="toolbar-spacer"></div><button class="btn btn-outline" data-action="import-projects">批量导入</button><button class="btn btn-primary" data-action="new-project">＋ 新建项目</button>
    </div>
    <div class="project-board-list">${list.length?list.map(project=>{
      const health=projectHealth(project);const roles=roleCoverageSummary(project);const warnings=projectStaffingWarnings(db,project);
      const priorityCode=(String(project.priority||'P2').match(/P[0-3]/i)?.[0]||'P2').toUpperCase();
      return `<div class="card project-board-row"><div class="project-identity"><div class="project-title-line"><strong title="${esc(project.name)}">${esc(project.name)}</strong><span class="priority-badge ${priorityCode.toLowerCase()}" title="${esc(project.priority||'P2 中')}">${priorityCode}</span></div><span title="${esc([project.shortName,project.scope].filter(Boolean).join(' · '))}">${esc([project.shortName,project.scope].filter(Boolean).join(' · ')||'未设置简称与规模')}</span><div class="identity-tags">${tag(project.status,statusTone(project.status))}${tag(health.label,health.key)}</div><small>DDL ${esc(project.ddl||'未设置')}</small></div><div class="board-progress"><strong>制作进度</strong>${phaseProgress('总进度',project.overallProgress)}${phaseProgress('资产',project.assetProgress,'blue')}${phaseProgress('视频',project.videoProgress,'violet')}</div><div class="board-team"><div class="board-team-head"><strong>核心团队</strong><span class="${warnings.length?'warn-text':''}">${roles.covered}/5 岗位</span></div><div class="role-board">${compactRoleBoard(project,true)}</div></div><div class="board-actions"><button class="btn btn-primary btn-sm" data-open-project="${project.id}">管理团队</button><button class="btn btn-outline btn-sm" data-edit-project="${project.id}">编辑资料</button></div></div>`;
    }).join(''):emptyBlock('▦','没有匹配项目','调整筛选条件，或新建第一个项目。','<button class="btn btn-primary" data-action="new-project">新建项目</button>')}</div>`;
}

function renderPeople() {
  const root = $('#view-people');
  const list = db.people.filter(item => {
    const keyword = filters.people.toLowerCase();
    const skills=(item.skillProfiles||[]).map(skill=>`${skill.skill}${skill.level}`).join(' ');
    return (!keyword || [item.name,item.department,item.position,item.skills,skills,item.capability].some(value => String(value || '').toLowerCase().includes(keyword)))
      && (filters.peopleDepartment === '全部' || item.department === filters.peopleDepartment)
      && (filters.peoplePosition === '全部' || item.position === filters.peoplePosition);
  });
  const overloaded=db.people.filter(person=>personRemainingCapacity(db,person)<0).length;
  const available=db.people.filter(person=>personAvailable(db,person)>0).length;
  const onLeave=db.people.filter(person=>person.employmentStatus!=='在岗').length;
  root.innerHTML = `
    <div class="section-heading"><div><h2>人员能力与产能</h2><p>技能、制作能力和逐项目产能占用集中维护</p></div></div>
    <div class="people-metrics"><div><span>人员总数</span><strong>${db.people.length}</strong></div><div><span>可调度</span><strong class="positive">${available}</strong></div><div><span>超负荷</span><strong class="negative">${overloaded}</strong></div><div><span>非在岗</span><strong>${onLeave}</strong></div></div>
    <div class="toolbar"><input class="searchbox" id="people-search" value="${esc(filters.people)}" placeholder="搜索姓名、职位或技能…"><select class="filter-select" id="people-department-filter">${['全部',...DEPARTMENTS].map(value=>`<option ${filters.peopleDepartment===value?'selected':''}>${esc(value)}</option>`).join('')}</select><select class="filter-select" id="people-position-filter">${['全部',...POSITIONS].map(value=>`<option ${filters.peoplePosition===value?'selected':''}>${esc(value)}</option>`).join('')}</select><div class="toolbar-spacer"></div><button class="btn btn-outline" data-action="import-people">批量导入</button><button class="btn btn-primary" data-action="new-person">＋ 新增人员</button></div>
    <div class="people-card-grid">${list.length?list.map(person=>{
      const used=personUsage(db,person.id),remaining=personRemainingCapacity(db,person);const workloads=personWorkloadBreakdown(db,person.id).filter(item=>item.active);
      const skills=(person.skillProfiles||[]).slice(0,5);const capabilities=(person.productionCapabilities||[]).slice(0,2);
      return `<article class="card person-card ${remaining<0?'overloaded':''}" data-open-person="${person.id}"><div class="person-card-head"><div class="avatar-name"><i class="avatar large">${esc(initials(person.name))}</i><div><strong>${esc(person.name)}</strong><span>${esc(person.department)} · ${esc(person.position||person.function||'未设置职位')}</span></div></div>${tag(person.employmentStatus||'在岗',person.employmentStatus==='在岗'?'green':'')}</div><div class="skill-chip-list">${skills.length?skills.map(item=>`<span>${esc(item.skill)}<b>${esc(item.level)}</b></span>`).join(''):'<em>暂无技能标签</em>'}</div><div class="capacity-band"><div><span>已占用</span><strong>${used}%</strong></div><div><span>剩余产能</span><strong class="${remaining<0?'negative':remaining<=20?'warning':'positive'}">${remaining}%</strong></div><div><span>预计释放</span><strong>${esc(person.releaseDate||'无固定日期')}</strong></div></div><div class="person-load-list">${workloads.length?workloads.slice(0,3).map(item=>`<div><span>${esc(item.name)}</span><b>${Number(item.allocation||0)}%</b></div>`).join(''):'<span class="muted-copy">当前无有效项目占用</span>'}</div><div class="capability-brief">${capabilities.length?capabilities.map(item=>`${esc(item.skill)} ${esc(item.quantity)}${esc(item.unit)}`).join(' · '):esc(person.capability||'暂无制作能力说明')}</div><div class="person-card-actions"><span>${workloads.length} 个进行中项目 · 可排按剩余产能判断</span><button class="btn btn-outline btn-sm" data-edit-person="${person.id}">编辑档案</button></div></article>`;
    }).join(''):emptyBlock('◎','没有匹配人员','调整筛选条件，或录入第一位人员。','<button class="btn btn-primary" data-action="new-person">新增人员</button>')}</div>`;
}

function availableCandidates(need) {
  return db.people.filter(person => personAvailable(db,person) > 0)
    .map(person => ({ person, available: personAvailable(db,person), match: personMatchesRole(person,need?.role) }))
    .sort((a,b) => Number(b.match)-Number(a.match) || b.available-a.available);
}

function renderSchedule() {
  const root = $('#view-schedule');
  const needs = db.staffingNeeds.filter(need => need.status !== '已满足' || needAllocated(db,need) < Number(need.requiredCapacity || 0));
  const candidates = db.people.filter(person=>personAvailable(db,person)>0).sort((a,b)=>personAvailable(db,b)-personAvailable(db,a));
  const projectGaps=db.projects.filter(project=>!['已完成','已取消'].includes(project.status)).flatMap(project=>projectRoleCoverage(db,project.id).filter(role=>!role.covered).map(role=>({project,role,critical:(project.status==='资产制作中'&&role.key==='asset')||(project.status==='视频制作中'&&role.key==='video')}))).sort((a,b)=>Number(b.critical)-Number(a.critical));
  root.innerHTML = `
    <div class="section-heading"><div><h2>项目缺口与可用产能</h2><p>从剩余产能人员中选择并添加到项目，分配后双方资料自动更新</p></div><button class="btn btn-primary" data-action="new-need">＋ 新建用人需求</button></div>
    ${projectGaps.length?`<div class="card core-gap-card"><div class="card-head"><div><h3>核心岗位缺员提醒</h3><p>${projectGaps.length} 个项目岗位尚未安排；红色项与当前制作阶段直接冲突</p></div>${tag(`${projectGaps.length} 项待处理`,'orange')}</div><div class="core-gap-list">${projectGaps.map(({project,role,critical})=>`<div class="core-gap-item ${critical?'critical':''}"><div><strong>${esc(project.name)}</strong><span>${esc(project.status)} · 缺少 ${esc(role.label)}</span></div><button class="btn ${critical?'btn-primary':'btn-outline'} btn-sm" data-assign-role="${esc(role.label)}" data-project-id="${project.id}">立即安排</button></div>`).join('')}</div></div>`:''}
    <div class="schedule-layout">
      <div class="card"><div class="card-head"><div><h3>待安排需求</h3><p>${needs.length} 项需求仍有产能缺口</p></div></div><div class="card-body"><div class="need-list">${needs.length ? needs.map(need => {
        const project = db.projects.find(item=>item.id===need.projectId); const allocated = needAllocated(db,need); const gap = Math.max(0, Number(need.requiredCapacity||0)-allocated);
        return `<div class="need-card"><div class="need-top"><div><h4>${esc(project?.name || '项目已删除')} · ${esc(need.role)}</h4><p>${esc(need.note || '暂无补充说明')}</p></div>${tag(gap ? '待安排' : '已满足',gap?'orange':'green')}</div><div class="need-meta"><div class="mini-stat"><span>环节</span><strong>${esc(need.stage || '未设置')}</strong></div><div class="mini-stat"><span>仍需产能</span><strong>${gap}%</strong></div><div class="mini-stat"><span>期望到岗</span><strong>${esc(need.neededBy || '尽快')}</strong></div></div><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-outline btn-sm" data-edit-need="${need.id}">编辑</button><button class="btn btn-primary btn-sm" data-assign-need="${need.id}">选择人员</button></div></div>`;
      }).join('') : emptyBlock('✓','暂无人员缺口','所有用人需求均已满足。','<button class="btn btn-soft" data-action="new-need">新建需求</button>')}</div></div></div>
      <div class="card"><div class="card-head"><div><h3>可调度人员</h3><p>按所有有效项目汇总后的剩余产能排列</p></div></div><div class="card-body">${candidates.length ? candidates.slice(0,12).map(person => `<div class="candidate"><i class="avatar">${esc(initials(person.name))}</i><div class="candidate-info"><strong>${esc(person.name)} · ${esc(person.position||person.function)}</strong><span>${esc((person.skillProfiles||[]).map(item=>`${item.skill} ${item.level}`).join('、') || '暂无技能标签')}</span></div>${tag(`可用 ${personAvailable(db,person)}%`,'green')}<button class="btn btn-outline btn-sm" data-assign-person="${person.id}">分配</button></div>`).join('') : emptyBlock('◎','暂无可用人员','在岗人员剩余产能均为 0%，或人员库为空。')}</div></div>
    </div>`;
}

function renderImport() {
  $('#view-import').innerHTML = `
    <div class="section-heading"><div><h2>批量导入基础数据</h2><p>支持 .xlsx、.xls、.csv；模板包含字段说明和示例</p></div></div>
    <div class="import-grid">
      <div class="card import-card"><div class="import-icon">▦</div><h3>项目资料</h3><p>导入项目基本信息、进度、客户、资料路径和各环节人员。重名项目将更新已有资料。</p><div class="import-actions"><button class="btn btn-primary" data-action="import-projects">选择文件导入</button><button class="btn btn-outline" data-template="projects">下载模板</button></div></div>
      <div class="card import-card"><div class="import-icon">◎</div><h3>人员资料</h3><p>导入部门职位、技能等级、制作能力、AI/其它部门项目及逐项目产能占用。重名人员将更新已有资料。</p><div class="import-actions"><button class="btn btn-primary" data-action="import-people">选择文件导入</button><button class="btn btn-outline" data-template="people">下载模板</button></div></div>
    </div>
    <div class="card tips"><h3>推荐导入顺序</h3><ol><li>先导入项目资料，便于人员表中的“AI项目及产能占用”按项目名称自动关联。</li><li>再下载并填写新版人员模板；技能和多个项目均用中文分号分隔，格式示例见“填写说明”工作表。</li><li>其它部门项目只记录在人档中，不会生成完整项目资料；每个项目可单独填写占用百分比。</li><li>若项目表中出现人员库没有的姓名，系统会自动建立待补充人员档案；导入前建议先导出备份。</li></ol></div>`;
}

function renderSettings() {
  const size = new Blob([JSON.stringify(db)]).size;
  $('#view-settings').innerHTML = `
    <div class="section-heading"><div><h2>本地数据维护</h2><p>数据保存在当前 Windows 用户目录，不上传网络</p></div></div>
    <div class="settings-grid">
      <div class="card settings-card"><h3>备份与恢复</h3><p>建议每周导出一次完整备份。备份包含项目、人员、分工和用人需求。</p><div class="setting-row"><div><strong>导出完整备份</strong><span>JSON 格式，可复制到移动硬盘</span></div><button class="btn btn-outline" data-action="backup">导出</button></div><div class="setting-row"><div><strong>从备份恢复</strong><span>将覆盖当前全部数据，操作前会再次确认</span></div><button class="btn btn-outline" data-action="restore">选择文件</button></div></div>
      <div class="card settings-card"><h3>数据库概况</h3><p>当前本地数据规模与维护操作。</p><div class="setting-row"><div><strong>${db.projects.length} 个项目 · ${db.people.length} 位人员</strong><span>${db.assignments.length} 条分工 · ${db.staffingNeeds.length} 条需求 · 约 ${(size/1024).toFixed(1)} KB</span></div></div><div class="setting-row"><div><strong>清空全部数据</strong><span>删除项目、人员、分工和需求</span></div><button class="btn btn-danger" data-action="clear">清空</button></div></div>
    </div>`;
}

function inputField(field, value = '') {
  const [key,label,type,required,options] = field; const full = type === 'textarea' || ['overview','script','outline','biographies','targetReference','acceptanceCriteria','artReference','riskNote','notes','capability'].includes(key);
  let control = '';
  if (type === 'select') control = `<select name="${key}" ${required?'required':''}>${options.map(option=>`<option value="${esc(option)}" ${String(value)===option?'selected':''}>${esc(option)}</option>`).join('')}</select>`;
  else if (type === 'textarea') control = `<textarea name="${key}" ${required?'required':''}>${esc(value)}</textarea>`;
  else control = `<input name="${key}" type="${type}" value="${esc(value)}" ${type==='number'?'min="0" max="100"':''} ${required?'required':''}>`;
  return `<div class="field ${full?'full':''}"><label>${esc(label)}${required?'<em>*</em>':''}</label>${control}</div>`;
}

function projectForm(project = {}) {
  const sectionBefore = { name:'基本信息', overview:'内容与验收资料', overallProgress:'进度与交付', svn:'地址与其它信息' };
  return projectFields.map(field => `${sectionBefore[field[0]]?`<div class="form-section">${sectionBefore[field[0]]}</div>`:''}${inputField(field, project[field[0]])}`).join('');
}

function openModal({ title, subtitle = '', body, size = '', footer = '', onOpen }) {
  $('#modal-root').innerHTML = `<div class="modal-backdrop"><div class="modal ${size}"><div class="modal-head"><div><h2>${esc(title)}</h2>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div><button class="modal-close" data-close-modal>×</button></div><div class="modal-body">${body}</div>${footer?`<div class="modal-foot">${footer}</div>`:''}</div></div>`;
  if (onOpen) onOpen($('.modal'));
}

function closeModal() { $('#modal-root').innerHTML = ''; }

function confirmDialog(title, text, danger = false) {
  return new Promise(resolve => {
    openModal({ title, body:`<p style="margin:0;color:var(--muted);font-size:12px;line-height:1.8">${esc(text)}</p>`, size:'small', footer:`<button class="btn btn-outline" id="confirm-cancel">取消</button><button class="btn ${danger?'btn-danger':'btn-primary'}" id="confirm-ok">确认</button>`, onOpen() {
      $('#confirm-cancel').onclick=()=>{closeModal();resolve(false)}; $('#confirm-ok').onclick=()=>{closeModal();resolve(true)};
    }});
  });
}

function formDataObject(form, fields) {
  const data = Object.fromEntries(new FormData(form));
  fields.filter(field=>field[2]==='number').forEach(([key])=>data[key]=clampPercent(data[key]));
  return data;
}

function editProject(id = '') {
  const existing = db.projects.find(item=>item.id===id) || {};
  openModal({ title:id?'编辑项目':'新建项目', subtitle:'人员分工将在项目详情或调度面板中维护', body:`<form id="project-form" class="form-grid">${projectForm(existing)}</form>`, footer:`${id?'<button class="btn btn-danger" id="delete-project">删除项目</button>':''}<button class="btn btn-outline" data-close-modal>取消</button><button class="btn btn-primary" id="save-project">保存项目</button>`, onOpen() {
    $('#save-project').onclick=async()=>{ const form=$('#project-form'); if(!form.reportValidity())return; const values=formDataObject(form,projectFields); if(!id&&db.projects.some(item=>item.name===values.name)){toast('项目名称已存在，请使用不同名称',true);return;} let savedProject;if(id){Object.assign(existing,values);savedProject=existing;}else{savedProject={id:uid('project'),...values};db.projects.unshift(savedProject);} logActivity(id?'更新项目':'新建项目',values.name); await persist('项目已保存');closeModal();renderAll(); const warnings=projectStaffingWarnings(db,savedProject);if(warnings.length)toast(warnings.map(item=>item.text).join('；'),warnings.some(item=>item.critical)); };
    if(id)$('#delete-project').onclick=async()=>{ if(!await confirmDialog('删除项目',`确定删除“${existing.name}”吗？相关分工和用人需求也会删除。`,true))return; db.projects=db.projects.filter(item=>item.id!==id);db.assignments=db.assignments.filter(item=>item.projectId!==id);db.staffingNeeds=db.staffingNeeds.filter(item=>item.projectId!==id);await persist('项目已删除');closeModal();renderAll(); };
  }});
}

function workloadRow(item={}) {
  const source=item.source==='其它部门'?'external':'ai';
  const projectId=item.projectId||'';
  return `<div class="workload-edit-row" data-assignment-id="${esc(item.id||'')}" data-need-id="${esc(item.needId||'')}" data-start-date="${esc(item.startDate||'')}"><select class="work-source"><option value="ai" ${source==='ai'?'selected':''}>AI 项目库</option><option value="external" ${source==='external'?'selected':''}>其它部门项目</option></select><div class="work-project ai-work-field"><select class="work-project-id"><option value="">选择项目</option>${db.projects.map(project=>`<option value="${project.id}" ${project.id===projectId?'selected':''}>${esc(project.name)}</option>`).join('')}</select></div><div class="work-project external-work-field"><input class="work-name" placeholder="项目名称" value="${esc(source==='external'?item.name:'')}"><input class="work-department" placeholder="归属部门" value="${esc(item.department||'')}"></div><input class="work-role" placeholder="项目角色" value="${esc(item.role||'')}"><div class="allocation-input"><input class="work-allocation" type="number" min="0" max="500" value="${Number(item.allocation||0)}"><span>%</span></div><input class="work-end-date" type="date" value="${esc(item.endDate||'')}"><select class="work-status"><option ${item.status==='待开始'?'selected':''}>待开始</option><option ${!item.status||item.status==='进行中'?'selected':''}>进行中</option><option ${item.status==='已结束'?'selected':''}>已结束</option><option ${item.status==='已取消'?'selected':''}>已取消</option></select><button type="button" class="icon-btn work-remove" title="移除">×</button></div>`;
}

function workloadEditorRowActive(row) {
  const status=$('.work-status',row).value,endDate=$('.work-end-date',row).value;
  if($('.work-source',row).value==='external')return !['已结束','已取消'].includes(status)&&(!endDate||endDate>=today());
  const role=$('.work-role',row).value;
  return assignmentConsumesCapacity(db,{projectId:$('.work-project-id',row).value,role,stage:role.includes('资产')?'资产':role.includes('视频')?'视频':'其它',status,endDate},today());
}

function showPerson(id) {
  const person=db.people.find(item=>item.id===id);if(!person)return;
  const used=personUsage(db,id),remaining=personRemainingCapacity(db,person);const workloads=personWorkloadBreakdown(db,id);
  const skillHtml=(person.skillProfiles||[]).map(item=>{const capability=(person.productionCapabilities||[]).find(cap=>cap.skill===item.skill);return `<div class="person-skill-detail"><div><strong>${esc(item.skill)}</strong>${tag(item.level,'blue')}</div><span>${capability?`${esc(capability.quantity)} ${esc(capability.unit)}${capability.complexity?` · ${esc(capability.complexity)}`:''}`:'未填写制作能力'}</span></div>`}).join('');
  openModal({title:person.name,subtitle:`${person.department} · ${person.position||person.function}`,size:'wide',body:`<div class="person-detail-summary"><div><span>标准产能</span><strong>${person.capacity||100}%</strong></div><div><span>当前占用</span><strong>${used}%</strong></div><div><span>剩余产能</span><strong class="${remaining<0?'negative':'positive'}">${remaining}%</strong></div><div><span>预计释放日期</span><strong>${esc(person.releaseDate||'无固定日期')}</strong></div><div><span>在岗状态</span><strong>${esc(person.employmentStatus||'在岗')}</strong></div></div><div class="capacity-rule-note">可安排与否按该人员所有有效项目的产能占用合计判断；预计释放日期仅作排期参考。</div><div class="person-detail-grid"><section><div class="detail-section-head"><strong>技能等级与制作能力</strong><span>${(person.skillProfiles||[]).length} 项技能</span></div><div class="person-skill-detail-list">${skillHtml||'<span class="muted-copy">尚未填写技能</span>'}</div><div class="ability-note"><span>综合能力说明</span><p>${esc(person.capability||'暂无说明')}</p></div></section><section><div class="detail-section-head"><strong>项目与产能占用</strong><span>有效占用合计 ${used}%</span></div><div class="person-work-detail-list">${workloads.length?workloads.map(item=>`<div class="person-work-detail ${item.active?'':'released'}"><div><strong>${esc(item.name)}</strong><span>${esc(item.source)} · ${esc(item.role||'未设置角色')}${item.endDate?` · 至 ${esc(item.endDate)}`:' · 持续性参与'}</span></div><b>${item.active?`${Number(item.allocation||0)}%`:'已释放'}</b></div>`).join(''):'<span class="muted-copy">暂无参与项目</span>'}</div></section></div>`,footer:`<button class="btn btn-outline" data-close-modal>关闭</button><button class="btn btn-primary" id="person-detail-edit">编辑人员档案</button>`,onOpen(){$('#person-detail-edit').onclick=()=>editPerson(id);}});
}

function editPerson(id = '') {
  const existing=migratePerson(db.people.find(item=>item.id===id)||{capacity:100,department:'AI项目组',position:'AI动画师',employmentStatus:'在岗'});
  const existingSkills=new Map((existing.skillProfiles||[]).map(item=>[item.skill,item.level]));
  const allSkills=[...new Set([...SKILL_OPTIONS,...existingSkills.keys()])];
  const aiWorkloads=id?db.assignments.filter(item=>item.personId===id).map(item=>({...item,source:'AI项目库'})):[];
  const workRows=[...aiWorkloads,...(existing.externalAssignments||[]).map(item=>({...item,source:'其它部门'}))];
  openModal({title:id?'编辑人员档案':'新增人员档案',subtitle:'技能、制作能力和项目占用将共同用于调度判断',size:'wide',body:`<form id="person-form" class="person-profile-form"><section class="profile-form-section"><div class="detail-section-head"><strong>基本资料</strong><span>部门与职位用于筛选和岗位匹配</span></div><div class="form-grid"><div class="field"><label>人员姓名<em>*</em></label><input name="name" required value="${esc(existing.name||'')}"></div><div class="field"><label>归属部门<em>*</em></label><select name="department" required>${DEPARTMENTS.map(value=>`<option ${existing.department===value?'selected':''}>${esc(value)}</option>`).join('')}</select></div><div class="field"><label>职位<em>*</em></label><select name="position" required>${POSITIONS.map(value=>`<option ${existing.position===value?'selected':''}>${esc(value)}</option>`).join('')}</select></div><div class="field"><label>在岗状态</label><select name="employmentStatus">${EMPLOYMENT_STATUSES.map(value=>`<option ${existing.employmentStatus===value?'selected':''}>${esc(value)}</option>`).join('')}</select></div><div class="field"><label>标准总产能（%）</label><input name="capacity" type="number" min="1" max="500" value="${Number(existing.capacity||100)}"></div><div class="field"><label>预计产能释放日期（选填）</label><input name="releaseDate" type="date" value="${esc(existing.releaseDate||'')}"><span class="hint">仅作排期参考；持续性岗位可留空。可排状态按全部有效项目的产能占用合计判断。</span></div><div class="field"><label>联系方式</label><input name="contact" value="${esc(existing.contact||'')}"></div><div class="field full"><label>综合能力说明</label><textarea name="capability">${esc(existing.capability||'')}</textarea></div><div class="field full"><label>备注</label><textarea name="notes">${esc(existing.notes||'')}</textarea></div></div></section><section class="profile-form-section"><div class="detail-section-head"><strong>技能标签与等级</strong><span>支持多选，每项技能可单独评级</span></div><div class="skill-selector">${allSkills.map(skill=>`<label class="skill-option"><input type="checkbox" class="skill-check" value="${esc(skill)}" ${existingSkills.has(skill)?'checked':''}><span>${esc(skill)}</span><select class="skill-level" ${existingSkills.has(skill)?'':'disabled'}>${SKILL_LEVELS.map(level=>`<option ${existingSkills.get(skill)===level?'selected':''}>${level}</option>`).join('')}</select></label>`).join('')}</div><div class="custom-skill-adder"><input id="custom-skill-name" placeholder="补充其它技能标签"><button type="button" class="btn btn-outline btn-sm" id="add-custom-skill">添加技能</button></div></section><section class="profile-form-section"><div class="detail-section-head"><strong>制作能力</strong><span>与已选技能对应，可填写数量、单位和项目等级</span></div><div class="capability-editor" id="capability-editor"></div></section><section class="profile-form-section"><div class="detail-section-head"><strong>参与项目与产能占用</strong><span>每个项目单独填写；总和允许超过 100%，超额人员不会进入可调度名单</span></div><div class="workload-column-head"><span>来源</span><span>项目</span><span>角色</span><span>占用</span><span>预计结束</span><span>状态</span><span></span></div><div id="workload-editor">${workRows.map(workloadRow).join('')}</div><button type="button" class="btn btn-soft btn-sm" id="add-workload">＋ 添加参与项目</button><div class="workload-total" id="workload-total"></div></section></form>`,footer:`${id?'<button class="btn btn-danger" id="delete-person">删除人员</button>':''}<button class="btn btn-outline" data-close-modal>取消</button><button class="btn btn-primary" id="save-person">保存人员档案</button>`,onOpen(){
    const capabilityMap=new Map((existing.productionCapabilities||[]).map(item=>[item.skill,item]));
    const renderCapabilities=()=>{const checked=$$('.skill-check:checked').map(input=>input.value);$('#capability-editor').innerHTML=checked.length?checked.map(skill=>{const item=capabilityMap.get(skill)||{};return `<div class="capability-edit-row" data-skill="${esc(skill)}"><strong>${esc(skill)}</strong><input class="cap-quantity" type="number" min="0" step="0.1" placeholder="数量" value="${esc(item.quantity||'')}"><input class="cap-unit" placeholder="单位，如 分钟/天" value="${esc(item.unit||CAPABILITY_UNIT_SUGGESTIONS[skill]||'')}"><input class="cap-complexity" placeholder="适用难度 / 等级" value="${esc(item.complexity||'')}"><input class="cap-note" placeholder="补充说明" value="${esc(item.note||'')}"></div>`}).join(''):'<span class="muted-copy">选择技能后即可填写对应制作能力</span>';};
    const refreshWorkRows=()=>{$$('.workload-edit-row').forEach(row=>{const external=$('.work-source',row).value==='external';$('.ai-work-field',row).hidden=external;$('.external-work-field',row).hidden=!external;});const total=$$('.workload-edit-row').filter(workloadEditorRowActive).reduce((sum,row)=>sum+Number($('.work-allocation',row).value||0),0);$('#workload-total').innerHTML=`有效项目占用合计 <strong class="${total>Number($('[name=capacity]').value||100)?'negative':'positive'}">${total}%</strong>${total>Number($('[name=capacity]').value||100)?'<span>已超过标准总产能，不建议继续安排新项目</span>':''}`;};
    const bindSkill=input=>input.onchange=()=>{input.closest('.skill-option').querySelector('.skill-level').disabled=!input.checked;renderCapabilities();};$$('.skill-check').forEach(bindSkill);
    $('#add-custom-skill').onclick=()=>{const skill=$('#custom-skill-name').value.trim();if(!skill)return;if($$('.skill-check').some(input=>input.value===skill)){toast('该技能标签已存在',true);return;}$('.skill-selector').insertAdjacentHTML('beforeend',`<label class="skill-option"><input type="checkbox" class="skill-check" value="${esc(skill)}" checked><span>${esc(skill)}</span><select class="skill-level">${SKILL_LEVELS.map(level=>`<option>${level}</option>`).join('')}</select></label>`);bindSkill($$('.skill-check').at(-1));$('#custom-skill-name').value='';renderCapabilities();};
    $('#capability-editor').addEventListener('input',event=>{const row=event.target.closest('.capability-edit-row');if(!row)return;capabilityMap.set(row.dataset.skill,{skill:row.dataset.skill,quantity:$('.cap-quantity',row).value,unit:$('.cap-unit',row).value,complexity:$('.cap-complexity',row).value,note:$('.cap-note',row).value});});
    $('#workload-editor').addEventListener('change',refreshWorkRows);$('#workload-editor').addEventListener('input',refreshWorkRows);$('#workload-editor').addEventListener('click',event=>{if(event.target.closest('.work-remove')){event.target.closest('.workload-edit-row').remove();refreshWorkRows();}});
    $('#add-workload').onclick=()=>{$('#workload-editor').insertAdjacentHTML('beforeend',workloadRow({source:'AI项目库',status:'进行中'}));refreshWorkRows();};$('[name=capacity]').oninput=refreshWorkRows;renderCapabilities();refreshWorkRows();
    $('#save-person').onclick=async()=>{const form=$('#person-form');if(!form.reportValidity())return;const raw=Object.fromEntries(new FormData(form));if(!id&&db.people.some(item=>item.name===raw.name)){toast('人员姓名已存在；如为同名人员，请添加团队标识',true);return;}const skillProfiles=$$('.skill-check:checked').map(input=>({skill:input.value,level:input.closest('.skill-option').querySelector('.skill-level').value}));const productionCapabilities=$$('.capability-edit-row').map(row=>({skill:row.dataset.skill,quantity:$('.cap-quantity',row).value,unit:$('.cap-unit',row).value,complexity:$('.cap-complexity',row).value,note:$('.cap-note',row).value})).filter(item=>item.quantity||item.unit||item.complexity||item.note);const saved=id?db.people.find(item=>item.id===id):{id:uid('person')};Object.assign(saved,migratePerson({...saved,...raw,capacity:Number(raw.capacity||100),function:positionToLegacyFunction(raw.position),skillProfiles,productionCapabilities,externalAssignments:[]}));if(!id)db.people.unshift(saved);db.assignments=db.assignments.filter(item=>item.personId!==saved.id);const externalAssignments=[];for(const row of $$('.workload-edit-row')){const source=$('.work-source',row).value;const common={id:row.dataset.assignmentId||uid(source==='ai'?'asg':'ext'),role:$('.work-role',row).value,allocation:Number($('.work-allocation',row).value||0),startDate:row.dataset.startDate||today(),endDate:$('.work-end-date',row).value,status:$('.work-status',row).value};if(source==='ai'){const projectId=$('.work-project-id',row).value;if(projectId)db.assignments.push({...common,personId:saved.id,projectId,needId:row.dataset.needId||'',stage:common.role.includes('资产')?'资产':common.role.includes('视频')?'视频':'其它'});}else{const name=$('.work-name',row).value.trim();if(name)externalAssignments.push({...common,name,department:$('.work-department',row).value||'其它部门'});}}saved.externalAssignments=externalAssignments;const total=personUsage(db,saved.id);logActivity(id?'更新人员':'新增人员',saved.name);await persist(total>Number(saved.capacity||100)?`人员资料已保存；当前超负荷 ${total-Number(saved.capacity||100)}%`:'人员资料已保存');closeModal();renderAll();};
    if(id)$('#delete-person').onclick=async()=>{if(!await confirmDialog('删除人员',`确定删除“${existing.name}”吗？该人员的项目分工会一并删除。`,true))return;db.people=db.people.filter(item=>item.id!==id);db.assignments=db.assignments.filter(item=>item.personId!==id);await persist('人员已删除');closeModal();renderAll();};
  }});
}

function showProject(id) {
  const project=db.projects.find(item=>item.id===id);if(!project)return;
  const coverage=projectRoleCoverage(db,id);const warnings=projectStaffingWarnings(db,project);const covered=coverage.filter(item=>item.covered).length;
  const details=[['项目概述',project.overview],['规模 / 时长',[project.scope,project.duration].filter(Boolean).join(' · ')],['客户',[project.clientCompany,project.clientContact].filter(Boolean).join(' · ')],['接单 / DDL',[project.orderDate,project.ddl].filter(Boolean).join(' → ')],['目标参考',project.targetReference],['验收标准',project.acceptanceCriteria],['美术参考',project.artReference],['风险 / 阻塞',project.riskNote],['项目地址',project.projectAddress],['SVN',project.svn]];
  const warningHtml=warnings.length?`<div class="staff-alert ${warnings.some(item=>item.critical)?'critical':''}"><strong>人员安排提醒</strong>${warnings.map(item=>`<span>${esc(item.text)}</span>`).join('')}</div>`:'';
  const teamHtml=coverage.map(role=>{
    const members=role.assignments.map(assignment=>({assignment,person:db.people.find(item=>item.id===assignment.personId)})).filter(item=>item.person);
    return `<div class="team-role-card ${role.covered?'':'missing'}"><div class="team-role-head"><div><strong>${esc(role.label)}</strong><span>${members.length?`${members.length} 人 · 支持多人`:'当前缺员'}</span></div><button class="btn btn-outline btn-sm" data-assign-role="${esc(role.label)}" data-project-id="${id}">＋ 安排</button></div><div class="team-member-list">${members.length?members.map(({assignment,person})=>{const occupied=assignmentConsumesCapacity(db,assignment,today());return `<div class="team-member"><div class="avatar-name"><i class="avatar">${esc(initials(person.name))}</i><div><strong>${esc(person.name)}</strong><span>${esc(person.function)} · ${occupied?`占用 ${assignment.allocation}%`:'产能已释放'}</span></div></div><span class="member-state ${occupied?'':'released'}">${occupied?'在项目':'已释放'}</span><button class="icon-btn" title="移除" data-delete-assignment="${assignment.id}">×</button></div>`}).join(''):'<span class="role-empty">尚未安排，点击右上角添加</span>'}</div></div>`;
  }).join('');
  const detailHtml=details.filter(([,value])=>value).map(([key,value])=>`<div class="detail-item ${String(value).length>80?'full':''}"><span>${key}</span><p>${esc(value)}</p></div>`).join('');
  openModal({title:project.name,subtitle:`${project.priority||'未设优先级'} · ${project.status||'未设状态'} · DDL ${project.ddl||'未设置'}`,size:'wide',body:`${warningHtml}<div class="project-command"><div class="command-head"><div><span>当前阶段</span><strong>${esc(project.status||'未设置')}</strong></div><div><span>核心岗位</span><strong>${covered}/5</strong></div><div><span>内审状态</span><strong>${esc(project.internalReview||'未开始')}</strong></div><div><span>交付日期</span><strong>${esc(project.ddl||'未设置')}</strong></div></div><div class="command-progress">${phaseProgress('项目总进度',project.overallProgress)}${phaseProgress('资产制作',project.assetProgress,'blue')}${phaseProgress('视频制作',project.videoProgress,'violet')}</div></div><div class="team-section-title"><div><strong>项目团队与人员安排</strong><span>核心岗位优先展示；缺员岗位可直接安排可用人员</span></div>${tag(`${covered}/5 岗位已覆盖`,covered===5?'green':'orange')}</div><div class="team-role-grid">${teamHtml}</div><details class="project-info-collapse"><summary><div><strong>查看项目基础资料</strong><span>概述、客户、参考资料、地址等次要信息</span></div><b>展开</b></summary><div class="detail-grid">${detailHtml||'<div class="role-empty">暂无补充资料</div>'}</div></details>`,footer:`<button class="btn btn-outline" data-close-modal>关闭</button><button class="btn btn-soft" id="detail-assign">＋ 其它支持人员</button><button class="btn btn-primary" id="detail-edit">编辑项目资料</button>`,onOpen(){
    $('#detail-edit').onclick=()=>editProject(id);$('#detail-assign').onclick=()=>editAssignment({projectId:id});$$('[data-delete-assignment]').forEach(button=>button.onclick=async()=>{const assignment=db.assignments.find(item=>item.id===button.dataset.deleteAssignment);const person=db.people.find(item=>item.id===assignment?.personId);if(!await confirmDialog('移除项目人员',`确定将“${person?.name||'该人员'}”从此项目移除吗？`,true))return;db.assignments=db.assignments.filter(item=>item.id!==button.dataset.deleteAssignment);await persist('项目人员已移除');showProject(id);renderAll();});
  }});
}

function editNeed(id='') {
  if(!db.projects.length){toast('请先新建项目',true);return;}const existing=db.staffingNeeds.find(item=>item.id===id)||{};
  openModal({title:id?'编辑用人需求':'新建用人需求',body:`<form id="need-form" class="form-grid"><div class="field full"><label>项目<em>*</em></label><select name="projectId" required>${db.projects.map(item=>`<option value="${item.id}" ${existing.projectId===item.id?'selected':''}>${esc(item.name)}</option>`).join('')}</select></div><div class="field"><label>所需职能 / 角色<em>*</em></label><input name="role" required value="${esc(existing.role||'')}"></div><div class="field"><label>制作环节</label><select name="stage">${['统筹','剧本','美术','资产','视频','剪辑','交付','其它'].map(v=>`<option ${existing.stage===v?'selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label>所需产能（%）<em>*</em></label><input name="requiredCapacity" type="number" min="1" max="500" required value="${esc(existing.requiredCapacity||50)}"></div><div class="field"><label>期望到岗日期</label><input name="neededBy" type="date" value="${esc(existing.neededBy||'')}"></div><div class="field full"><label>需求说明</label><textarea name="note">${esc(existing.note||'')}</textarea></div></form>`,footer:`<button class="btn btn-outline" data-close-modal>取消</button><button class="btn btn-primary" id="save-need">保存需求</button>`,onOpen(){
    $('#save-need').onclick=async()=>{const form=$('#need-form');if(!form.reportValidity())return;const values=Object.fromEntries(new FormData(form));values.requiredCapacity=Number(values.requiredCapacity);values.status='待安排';if(id)Object.assign(existing,values);else db.staffingNeeds.unshift({id:uid('need'),...values});await persist('用人需求已保存');closeModal();renderAll();};
  }});
}

function editAssignment({projectId='',personId='',needId='',role=''}={}) {
  if(!db.projects.length||!db.people.length){toast('需要先录入项目和人员',true);return;}
  const need=db.staffingNeeds.find(item=>item.id===needId);if(need)projectId=need.projectId;
  const requestedRole=role||need?.role||'';
  const roleDefinition=REQUIRED_PROJECT_ROLES.find(item=>item.label===requestedRole||item.function===requestedRole);
  const selectedRole=roleDefinition?.label||requestedRole||'其它支持';
  const roleFunction=roleDefinition?.function||requestedRole;
  const candidateList=(need?availableCandidates(need).map(item=>item.person):db.people.filter(item=>personAvailable(db,item)>0))
    .sort((a,b)=>Number(personMatchesRole(b,roleFunction))-Number(personMatchesRole(a,roleFunction))||personAvailable(db,b)-personAvailable(db,a));
  if(!candidateList.length){toast('暂无剩余产能大于 0% 的可调度人员',true);return;}
  if(!personId||!candidateList.some(item=>item.id===personId))personId=candidateList[0].id;
  const initialStage=roleDefinition?.stage||need?.stage||'其它';
  const initialAllocation=Math.min(need?Math.max(1,Number(need.requiredCapacity)-needAllocated(db,need)):20,personAvailable(db,db.people.find(item=>item.id===personId))||100);
  const roleOptions=[...REQUIRED_PROJECT_ROLES.map(item=>item.label),'其它支持',...(!roleDefinition&&requestedRole&&requestedRole!=='其它支持'?[requestedRole]:[])];
  openModal({title:requestedRole?`安排${requestedRole}`:'添加项目人员',subtitle:requestedRole?`优先展示职能匹配且产能未满的人员`:'仅展示剩余产能大于 0% 的人员',size:'medium',body:`<form id="assignment-form" class="form-grid">
    <div class="field full"><label>项目<em>*</em></label><select name="projectId" ${need?'disabled':''}>${db.projects.map(item=>`<option value="${item.id}" ${projectId===item.id?'selected':''}>${esc(item.name)}</option>`).join('')}</select></div>
    <div class="field full"><label>人员<em>*</em></label><select name="personId">${candidateList.map(person=>`<option value="${person.id}" ${personId===person.id?'selected':''}>${esc(person.name)} · ${esc(person.position||person.function)} · 可用 ${personAvailable(db,person)}%</option>`).join('')}</select></div>
    <div class="field"><label>项目角色<em>*</em></label><select name="role" required>${roleOptions.map(value=>`<option ${selectedRole===value?'selected':''}>${esc(value)}</option>`).join('')}</select></div>
    <div class="field"><label>制作环节</label><select name="stage">${['统筹','剧本','美术','资产','视频','剪辑','交付','其它'].map(value=>`<option ${initialStage===value?'selected':''}>${value}</option>`).join('')}</select></div>
    <div class="field"><label>投入产能（%）<em>*</em></label><input name="allocation" type="number" min="1" max="100" required value="${initialAllocation}"></div>
    <div class="field"><label>状态</label><select name="status"><option>进行中</option><option>待开始</option><option>已结束</option></select></div>
    <div class="field"><label>开始日期</label><input name="startDate" type="date" value="${today()}"></div>
    <div class="field"><label>预计结束日期（选填）</label><input name="endDate" type="date" value=""><span class="hint">持续性岗位可留空；留空时会持续计入该人员的项目产能占用。</span></div>
    <div class="field full"><div class="capacity-preview" id="capacity-preview"></div></div></form>`,footer:`<button class="btn btn-outline" data-close-modal>取消</button><button class="btn btn-primary" id="save-assignment">确认分配</button>`,onOpen(){
    const update=()=>{const person=db.people.find(item=>item.id===$('[name=personId]').value);const available=personAvailable(db,person);const allocation=Number($('[name=allocation]').value||0);$('#capacity-preview').innerHTML=`${esc(person?.name||'')} 当前剩余 <strong>${available}%</strong>；分配后剩余 <strong style="color:${allocation>available?'var(--red)':'var(--mint-dark)'}">${available-allocation}%</strong>${allocation>available?'（将超出标准产能）':''}`;};
    $('[name=personId]').onchange=update;$('[name=allocation]').oninput=update;update();
    $('#save-assignment').onclick=async()=>{const form=$('#assignment-form');if(!form.reportValidity())return;const values=Object.fromEntries(new FormData(form));values.projectId=need?.projectId||values.projectId;values.allocation=Number(values.allocation);const person=db.people.find(item=>item.id===values.personId);const available=personAvailable(db,person);if(values.allocation>available&&!await confirmDialog('产能将超额',`${person.name} 当前仅剩 ${available}% 产能，仍要分配 ${values.allocation}% 吗？`))return;db.assignments.unshift({id:uid('asg'),needId:needId||'',...values});if(need&&needAllocated(db,need)>=Number(need.requiredCapacity))need.status='已满足';logActivity('人员调度',`${person.name} → ${db.projects.find(item=>item.id===values.projectId)?.name}`);await persist('人员已添加到项目');closeModal();renderAll();};
  }});
}

async function importSheet(kind) {
  const result=await api.importSheet(kind);if(result.canceled)return;if(result.error){toast(result.error,true);return;}const rows=result.rows||[];if(!rows.length){toast('文件中没有可导入的数据',true);return;}const ok=await confirmDialog('确认批量导入',`检测到 ${rows.length} 行${kind==='projects'?'项目':'人员'}数据。重名记录将更新，是否继续？`);if(!ok)return;
  let created=0,updated=0,skipped=0;
  if(kind==='people'){
    for(const row of rows){const values=normalizePersonRow(row);if(!String(values.name||'').trim()){skipped++;continue;}const aiProjects=values.aiProjectAllocations||[];delete values.aiProjectAllocations;let person=db.people.find(item=>item.name===values.name);if(person){Object.assign(person,values);updated++;}else{person={id:uid('person'),...values};db.people.push(person);created++;}const legacyTotal=Number(row['目前参与项目占据产能的百分比']||0);for(const entry of aiProjects){const project=db.projects.find(item=>item.name===entry.name||item.shortName===entry.name);if(!project)continue;const allocation=entry.allocation||Math.round(legacyTotal/Math.max(1,aiProjects.length));const existingAssignment=db.assignments.find(item=>item.personId===person.id&&item.projectId===project.id);const assignment={projectId:project.id,personId:person.id,role:entry.role||person.function,stage:(entry.role||'').includes('资产')?'资产':(entry.role||'').includes('视频')?'视频':'其它',allocation,startDate:today(),endDate:entry.endDate||project.ddl||'',status:'进行中'};if(existingAssignment)Object.assign(existingAssignment,assignment);else db.assignments.push({id:uid('asg'),...assignment});}}
  } else {
    for(const row of rows){const values=normalizeProjectRow(row);if(!String(values.name||'').trim()){skipped++;continue;}let project=db.projects.find(item=>item.name===values.name);if(project){Object.assign(project,values);updated++;}else{project={id:uid('project'),...values};db.projects.push(project);created++;}for(const role of roleColumns(row)){let person=db.people.find(item=>item.name===role.name);if(!person){person=migratePerson({id:uid('person'),name:role.name,department:'未分配',function:role.fallbackFunction,capability:'由项目资料导入自动创建，请补充完整人员信息',capacity:100,releaseDate:'',employmentStatus:'在岗',contact:'',notes:''});db.people.push(person);}if(!db.assignments.some(item=>item.projectId===project.id&&item.personId===person.id&&item.role===role.role)){db.assignments.push({id:uid('asg'),projectId:project.id,personId:person.id,role:role.role,stage:role.role.includes('资产')?'资产':role.role.includes('视频')?'视频':'统筹',allocation:0,startDate:project.orderDate||'',endDate:project.ddl||'',status:'进行中'});}}
    }
  }
  logActivity('批量导入',`${kind==='projects'?'项目':'人员'}：新增 ${created}，更新 ${updated}`);await persist(`导入完成：新增 ${created}，更新 ${updated}${skipped?`，跳过 ${skipped}`:''}`);renderAll();
}

async function handleAction(action) {
  if(action==='new-project')editProject();
  if(action==='new-person')editPerson();
  if(action==='new-need')editNeed();
  if(action==='import-projects')importSheet('projects');
  if(action==='import-people')importSheet('people');
  if(action==='backup'){const result=await api.exportBackup(db);if(result?.error)toast(result.error,true);else if(!result?.canceled)toast('完整备份已导出');}
  if(action==='restore'){const result=await api.importBackup();if(result?.error){toast(result.error,true);return;}if(result?.canceled)return;if(await confirmDialog('覆盖当前数据','恢复备份会覆盖当前全部数据。确定继续吗？',true)){db=migrateDatabase(result.data);await persist('备份已恢复');renderAll();}}
  if(action==='clear'){if(await confirmDialog('清空全部数据','此操作会删除所有项目、人员、分工与需求，且无法撤销。',true)){db=emptyDatabase();await persist('全部数据已清空');renderAll();}}
}

document.addEventListener('click', async event => {
  const nav=event.target.closest('[data-view]');if(nav){setView(nav.dataset.view);return;}
  const go=event.target.closest('[data-go]');if(go){setView(go.dataset.go);return;}
  const action=event.target.closest('[data-action]');if(action){handleAction(action.dataset.action);return;}
  const close=event.target.closest('[data-close-modal]');if(close){closeModal();return;}
  if(event.target.classList.contains('modal-backdrop')){closeModal();return;}
  const openProject=event.target.closest('[data-open-project]');if(openProject){showProject(openProject.dataset.openProject);return;}
  const editProjectButton=event.target.closest('[data-edit-project]');if(editProjectButton){editProject(editProjectButton.dataset.editProject);return;}
  const editPersonButton=event.target.closest('[data-edit-person]');if(editPersonButton){editPerson(editPersonButton.dataset.editPerson);return;}
  const openPerson=event.target.closest('[data-open-person]');if(openPerson){showPerson(openPerson.dataset.openPerson);return;}
  const editNeedButton=event.target.closest('[data-edit-need]');if(editNeedButton){editNeed(editNeedButton.dataset.editNeed);return;}
  const assignNeed=event.target.closest('[data-assign-need]');if(assignNeed){editAssignment({needId:assignNeed.dataset.assignNeed});return;}
  const assignPerson=event.target.closest('[data-assign-person]');if(assignPerson){editAssignment({personId:assignPerson.dataset.assignPerson});return;}
  const assignRole=event.target.closest('[data-assign-role]');if(assignRole){editAssignment({projectId:assignRole.dataset.projectId,role:assignRole.dataset.assignRole});return;}
  const template=event.target.closest('[data-template]');if(template){const result=await api.saveTemplate(template.dataset.template);if(result?.error)toast(result.error,true);else if(!result?.canceled)toast('导入模板已保存');}
});

document.addEventListener('input', event => {
  if(event.target.id==='project-search'){filters.projects=event.target.value;renderProjects();const input=$('#project-search');input?.focus();input?.setSelectionRange(input.value.length,input.value.length);}
  if(event.target.id==='people-search'){filters.people=event.target.value;renderPeople();const input=$('#people-search');input?.focus();input?.setSelectionRange(input.value.length,input.value.length);}
});
document.addEventListener('change', event => {
  if(event.target.id==='project-status-filter'){filters.projectStatus=event.target.value;renderProjects();}
  if(event.target.id==='people-department-filter'){filters.peopleDepartment=event.target.value;renderPeople();}
  if(event.target.id==='people-position-filter'){filters.peoplePosition=event.target.value;renderPeople();}
});

$('#quick-project').onclick=()=>editProject();
$('#quick-need').onclick=()=>editNeed();
$('#global-search').addEventListener('keydown',event=>{if(event.key!=='Enter')return;const value=event.target.value.trim();if(!value)return;filters.projects=value;setView('projects');});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeModal();});

db = migrateDatabase(await api.loadData());
renderAll();
