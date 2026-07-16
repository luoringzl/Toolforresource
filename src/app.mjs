import {
  projectFields, peopleFields, emptyDatabase, uid, clampPercent, personUsage, personAvailable,
  projectAssignments, projectHealth, needAllocated, dashboardMetrics, splitNames,
  normalizeProjectRow, normalizePersonRow, roleColumns
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
const filters = { projects: '', projectStatus: '全部', people: '', peopleFunction: '全部' };

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

function renderDashboard() {
  const root = $('#view-dashboard');
  const metrics = dashboardMetrics(db);
  const active = db.projects.filter(item => !['已完成','已取消'].includes(item.status)).sort((a,b) => (a.ddl || '9999').localeCompare(b.ddl || '9999')).slice(0, 7);
  const people = db.people.filter(item => item.employmentStatus !== '离岗').sort((a,b) => personUsage(db,b.id)-personUsage(db,a.id)).slice(0,7);
  root.innerHTML = `
    <div class="metrics">
      <div class="metric green"><div class="metric-label">进行中项目</div><div class="metric-value">${metrics.active}</div><div class="metric-note">制作中与待验收</div></div>
      <div class="metric blue"><div class="metric-label">平均项目进度</div><div class="metric-value">${metrics.averageProgress}<small>%</small></div><div class="metric-note">按进行中项目计算</div></div>
      <div class="metric orange"><div class="metric-label">待安排需求</div><div class="metric-value">${metrics.openNeeds}</div><div class="metric-note">仍存在人员缺口</div></div>
      <div class="metric red"><div class="metric-label">风险项目</div><div class="metric-value">${metrics.risky}</div><div class="metric-note">临期、逾期或有阻塞</div></div>
      <div class="metric violet"><div class="metric-label">可调度人员</div><div class="metric-value">${metrics.availablePeople}</div><div class="metric-note">剩余产能大于 0%</div></div>
    </div>
    <div class="dashboard-grid">
      <div class="card">
        <div class="card-head"><div><h3>项目进展与交付</h3><p>按 DDL 从近到远排列</p></div><button class="link-btn" data-go="projects">查看全部 →</button></div>
        <div class="card-body">${active.length ? active.map(project => {
          const health = projectHealth(project); const team = peopleForProject(project.id);
          return `<div class="project-line" data-open-project="${project.id}">
            <div class="project-name"><strong>${esc(project.name)}</strong><span>${esc(project.shortName || project.scope || '暂无简称与规模')}</span></div>
            <div>${progress(project.overallProgress)}</div>
            <div><div class="mini-team">${team.slice(0,3).map(({person}) => `<i class="mini-avatar" title="${esc(person.name)}">${esc(initials(person.name))}</i>`).join('')}${team.length > 3 ? `<i class="mini-avatar">+${team.length-3}</i>` : ''}</div></div>
            <div class="deadline"><strong>${esc(project.ddl || '未设 DDL')}</strong>${tag(health.label, health.key)}</div>
          </div>`;
        }).join('') : emptyBlock('▦','还没有项目','新建项目后，这里会展示进度、负责人和交付风险。','<button class="btn btn-primary" data-action="new-project">新建项目</button>')}</div>
      </div>
      <div class="card">
        <div class="card-head"><div><h3>团队产能负载</h3><p>当前所有有效项目的占用合计</p></div><button class="link-btn" data-go="people">人员库 →</button></div>
        <div class="card-body">${people.length ? people.map(person => {
          const used = personUsage(db, person.id); const ratio = Math.min(100, used); const cls = used > 100 ? 'over' : used >= 85 ? 'hot' : '';
          return `<div class="workload-item"><div class="workload-top"><div class="avatar-name"><i class="avatar">${esc(initials(person.name))}</i><div><strong>${esc(person.name)}</strong><span>${esc(person.function || '未设置职能')}</span></div></div><span class="percent">${used}% / ${person.capacity || 100}%</span></div><div class="workload-bar"><i class="${cls}" style="width:${ratio}%"></i></div></div>`;
        }).join('') : emptyBlock('◎','还没有人员','录入人员后，这里会自动汇总产能。')}</div>
      </div>
    </div>`;
}

function renderProjects() {
  const root = $('#view-projects');
  const list = db.projects.filter(item => {
    const keyword = filters.projects.toLowerCase();
    return (!keyword || [item.name,item.shortName,item.clientCompany,item.clientContact].some(value => String(value || '').toLowerCase().includes(keyword))) && (filters.projectStatus === '全部' || item.status === filters.projectStatus);
  });
  root.innerHTML = `
    <div class="section-heading"><div><h2>全部项目</h2><p>共 ${db.projects.length} 个项目，人员信息通过分工记录双向关联</p></div></div>
    <div class="toolbar">
      <input class="searchbox" id="project-search" value="${esc(filters.projects)}" placeholder="搜索项目名、客户或对接人…">
      <select class="filter-select" id="project-status-filter">${['全部','待启动','制作中','暂停','待验收','已完成','已取消'].map(value => `<option ${filters.projectStatus===value?'selected':''}>${value}</option>`).join('')}</select>
      <div class="toolbar-spacer"></div><button class="btn btn-outline" data-action="import-projects">批量导入</button><button class="btn btn-primary" data-action="new-project">＋ 新建项目</button>
    </div>
    <div class="card table-card">${list.length ? `<table class="data-table"><thead><tr><th>项目</th><th>优先级</th><th>状态</th><th>总进度</th><th>项目团队</th><th>DDL</th><th>健康度</th><th></th></tr></thead><tbody>${list.map(project => {
      const team = peopleForProject(project.id); const health = projectHealth(project);
      return `<tr><td><div class="cell-title">${esc(project.name)}</div><div class="cell-sub">${esc([project.shortName,project.scope,project.clientCompany].filter(Boolean).join(' · ') || '暂无补充信息')}</div></td>
        <td><span class="priority ${(project.priority || 'P2').slice(0,2).toLowerCase()}">${esc(project.priority || 'P2 中')}</span></td><td>${tag(project.status, project.status==='制作中'?'green':project.status==='已完成'?'blue':'')}</td>
        <td style="min-width:130px">${progress(project.overallProgress)}</td><td><div class="mini-team">${team.slice(0,4).map(({person})=>`<i class="mini-avatar" title="${esc(person.name)}">${esc(initials(person.name))}</i>`).join('')}${!team.length?'<span class="cell-sub">未安排</span>':''}</div></td>
        <td>${esc(project.ddl || '—')}</td><td>${tag(health.label,health.key)}</td><td style="white-space:nowrap"><button class="icon-btn" title="详情" data-open-project="${project.id}">☰</button><button class="icon-btn" title="编辑" data-edit-project="${project.id}">✎</button></td></tr>`;
    }).join('')}</tbody></table>` : emptyBlock('▦','没有匹配项目','调整筛选条件，或新建第一个项目。','<button class="btn btn-primary" data-action="new-project">新建项目</button>')}</div>`;
}

function renderPeople() {
  const root = $('#view-people');
  const functions = ['全部', ...new Set(db.people.map(item => item.function).filter(Boolean))];
  const list = db.people.filter(item => {
    const keyword = filters.people.toLowerCase();
    return (!keyword || [item.name,item.department,item.function,item.skills,item.capability].some(value => String(value || '').toLowerCase().includes(keyword))) && (filters.peopleFunction === '全部' || item.function === filters.peopleFunction);
  });
  root.innerHTML = `
    <div class="section-heading"><div><h2>全部人员</h2><p>共 ${db.people.length} 人；剩余产能根据当前有效分工自动计算</p></div></div>
    <div class="toolbar"><input class="searchbox" id="people-search" value="${esc(filters.people)}" placeholder="搜索姓名、职能或技能…"><select class="filter-select" id="people-function-filter">${functions.map(value=>`<option ${filters.peopleFunction===value?'selected':''}>${esc(value)}</option>`).join('')}</select><div class="toolbar-spacer"></div><button class="btn btn-outline" data-action="import-people">批量导入</button><button class="btn btn-primary" data-action="new-person">＋ 新增人员</button></div>
    <div class="card table-card">${list.length ? `<table class="data-table"><thead><tr><th>人员</th><th>职能 / 能力</th><th>参与项目</th><th>产能占用</th><th>剩余产能</th><th>释放日期</th><th>在岗状态</th><th></th></tr></thead><tbody>${list.map(person => {
      const used = personUsage(db, person.id); const available = personAvailable(db,person); const assignments = db.assignments.filter(item=>item.personId===person.id&&item.status!=='已结束');
      const projects = assignments.map(item=>db.projects.find(project=>project.id===item.projectId)?.shortName || db.projects.find(project=>project.id===item.projectId)?.name).filter(Boolean);
      return `<tr><td><div class="avatar-name"><i class="avatar">${esc(initials(person.name))}</i><div><strong>${esc(person.name)}</strong><span>${esc(person.department || '未设置团队')}</span></div></div></td><td><div class="cell-title">${esc(person.function || '其它')} · ${esc(person.skillLevel || '未评级')}</div><div class="cell-sub">${esc(person.skills || person.capability || '暂无能力说明')}</div></td><td><div class="cell-sub" title="${esc(projects.join('、'))}">${esc(projects.join('、') || '暂无项目')}</div></td><td style="min-width:130px">${progress(Math.min(100,used))}<div class="cell-sub">${used}% / ${person.capacity || 100}%</div></td><td>${tag(`${available}%`,available===0?'red':available<=20?'orange':'green')}</td><td>${esc(person.releaseDate || '—')}</td><td>${tag(person.employmentStatus || '在岗',person.employmentStatus==='在岗'?'green':'')}</td><td><button class="icon-btn" title="编辑" data-edit-person="${person.id}">✎</button></td></tr>`;
    }).join('')}</tbody></table>` : emptyBlock('◎','没有匹配人员','调整筛选条件，或录入第一位人员。','<button class="btn btn-primary" data-action="new-person">新增人员</button>')}</div>`;
}

function availableCandidates(need) {
  return db.people.filter(person => person.employmentStatus !== '离岗' && personAvailable(db,person) > 0)
    .map(person => ({ person, available: personAvailable(db,person), match: person.function === need?.role || String(person.skills || '').includes(need?.role || '') }))
    .sort((a,b) => Number(b.match)-Number(a.match) || b.available-a.available);
}

function renderSchedule() {
  const root = $('#view-schedule');
  const needs = db.staffingNeeds.filter(need => need.status !== '已满足' || needAllocated(db,need) < Number(need.requiredCapacity || 0));
  const candidates = db.people.filter(person=>person.employmentStatus!=='离岗'&&personAvailable(db,person)>0).sort((a,b)=>personAvailable(db,b)-personAvailable(db,a));
  root.innerHTML = `
    <div class="section-heading"><div><h2>项目缺口与可用产能</h2><p>从剩余产能人员中选择并添加到项目，分配后双方资料自动更新</p></div><button class="btn btn-primary" data-action="new-need">＋ 新建用人需求</button></div>
    <div class="schedule-layout">
      <div class="card"><div class="card-head"><div><h3>待安排需求</h3><p>${needs.length} 项需求仍有产能缺口</p></div></div><div class="card-body"><div class="need-list">${needs.length ? needs.map(need => {
        const project = db.projects.find(item=>item.id===need.projectId); const allocated = needAllocated(db,need); const gap = Math.max(0, Number(need.requiredCapacity||0)-allocated);
        return `<div class="need-card"><div class="need-top"><div><h4>${esc(project?.name || '项目已删除')} · ${esc(need.role)}</h4><p>${esc(need.note || '暂无补充说明')}</p></div>${tag(gap ? '待安排' : '已满足',gap?'orange':'green')}</div><div class="need-meta"><div class="mini-stat"><span>环节</span><strong>${esc(need.stage || '未设置')}</strong></div><div class="mini-stat"><span>仍需产能</span><strong>${gap}%</strong></div><div class="mini-stat"><span>期望到岗</span><strong>${esc(need.neededBy || '尽快')}</strong></div></div><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-outline btn-sm" data-edit-need="${need.id}">编辑</button><button class="btn btn-primary btn-sm" data-assign-need="${need.id}">选择人员</button></div></div>`;
      }).join('') : emptyBlock('✓','暂无人员缺口','所有用人需求均已满足。','<button class="btn btn-soft" data-action="new-need">新建需求</button>')}</div></div></div>
      <div class="card"><div class="card-head"><div><h3>可调度人员</h3><p>按剩余产能从高到低排列</p></div></div><div class="card-body">${candidates.length ? candidates.slice(0,12).map(person => `<div class="candidate"><i class="avatar">${esc(initials(person.name))}</i><div class="candidate-info"><strong>${esc(person.name)} · ${esc(person.function)}</strong><span>${esc(person.skills || person.skillLevel || '暂无技能标签')}</span></div>${tag(`可用 ${personAvailable(db,person)}%`,'green')}<button class="btn btn-outline btn-sm" data-assign-person="${person.id}">分配</button></div>`).join('') : emptyBlock('◎','暂无可用人员','所有在岗人员产能已满，或人员库为空。')}</div></div>
    </div>`;
}

function renderImport() {
  $('#view-import').innerHTML = `
    <div class="section-heading"><div><h2>批量导入基础数据</h2><p>支持 .xlsx、.xls、.csv；模板包含字段说明和示例</p></div></div>
    <div class="import-grid">
      <div class="card import-card"><div class="import-icon">▦</div><h3>项目资料</h3><p>导入项目基本信息、进度、客户、资料路径和各环节人员。重名项目将更新已有资料。</p><div class="import-actions"><button class="btn btn-primary" data-action="import-projects">选择文件导入</button><button class="btn btn-outline" data-template="projects">下载模板</button></div></div>
      <div class="card import-card"><div class="import-icon">◎</div><h3>人员资料</h3><p>导入人员能力、职能、产能、参与项目和在岗状态。重名人员将更新已有资料。</p><div class="import-actions"><button class="btn btn-primary" data-action="import-people">选择文件导入</button><button class="btn btn-outline" data-template="people">下载模板</button></div></div>
    </div>
    <div class="card tips"><h3>推荐导入顺序</h3><ol><li>先下载并填写“人员资料导入模板”，导入完整人员名册。</li><li>再填写“项目资料导入模板”。人员列按姓名填写，多人使用顿号“、”分隔。</li><li>若项目表中出现人员库没有的姓名，系统会自动建立“待补充资料”的人员记录，确保关联不丢失。</li><li>导入前建议在“数据与设置”中导出备份；任何时候都可以离线恢复。</li></ol></div>`;
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

function personForm(person = {}) {
  const sectionBefore = { name:'人员信息', capability:'能力与产能', contact:'联系与备注' };
  return peopleFields.map(field => `${sectionBefore[field[0]]?`<div class="form-section">${sectionBefore[field[0]]}</div>`:''}${inputField(field, person[field[0]] ?? (field[0]==='capacity'?100:''))}`).join('');
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
    $('#save-project').onclick=async()=>{ const form=$('#project-form'); if(!form.reportValidity())return; const values=formDataObject(form,projectFields); if(!id&&db.projects.some(item=>item.name===values.name)){toast('项目名称已存在，请使用不同名称',true);return;} if(id)Object.assign(existing,values);else db.projects.unshift({id:uid('project'),...values}); logActivity(id?'更新项目':'新建项目',values.name); await persist('项目已保存');closeModal();renderAll(); };
    if(id)$('#delete-project').onclick=async()=>{ if(!await confirmDialog('删除项目',`确定删除“${existing.name}”吗？相关分工和用人需求也会删除。`,true))return; db.projects=db.projects.filter(item=>item.id!==id);db.assignments=db.assignments.filter(item=>item.projectId!==id);db.staffingNeeds=db.staffingNeeds.filter(item=>item.projectId!==id);await persist('项目已删除');closeModal();renderAll(); };
  }});
}

function editPerson(id = '') {
  const existing=db.people.find(item=>item.id===id)||{};
  openModal({title:id?'编辑人员':'新增人员',body:`<form id="person-form" class="form-grid">${personForm(existing)}</form>`,footer:`${id?'<button class="btn btn-danger" id="delete-person">删除人员</button>':''}<button class="btn btn-outline" data-close-modal>取消</button><button class="btn btn-primary" id="save-person">保存人员</button>`,onOpen(){
    $('#save-person').onclick=async()=>{const form=$('#person-form');if(!form.reportValidity())return;const values=formDataObject(form,peopleFields);if(!id&&db.people.some(item=>item.name===values.name)){toast('人员姓名已存在；如为同名人员，请在姓名后添加团队标识',true);return;}if(id)Object.assign(existing,values);else db.people.unshift({id:uid('person'),...values});logActivity(id?'更新人员':'新增人员',values.name);await persist('人员资料已保存');closeModal();renderAll();};
    if(id)$('#delete-person').onclick=async()=>{if(!await confirmDialog('删除人员',`确定删除“${existing.name}”吗？该人员的项目分工会一并删除。`,true))return;db.people=db.people.filter(item=>item.id!==id);db.assignments=db.assignments.filter(item=>item.personId!==id);await persist('人员已删除');closeModal();renderAll();};
  }});
}

function showProject(id) {
  const project=db.projects.find(item=>item.id===id);if(!project)return;const team=peopleForProject(id);const details=[['项目概述',project.overview],['规模 / 时长',[project.scope,project.duration].filter(Boolean).join(' · ')],['客户',[project.clientCompany,project.clientContact].filter(Boolean).join(' · ')],['接单 / DDL',[project.orderDate,project.ddl].filter(Boolean).join(' → ')],['目标参考',project.targetReference],['验收标准',project.acceptanceCriteria],['美术参考',project.artReference],['风险 / 阻塞',project.riskNote],['项目地址',project.projectAddress],['SVN',project.svn]];
  openModal({title:project.name,subtitle:`${project.priority||'未设优先级'} · ${project.status||'未设状态'} · 总进度 ${clampPercent(project.overallProgress)}%`,body:`<div class="detail-grid">${details.filter(([,v])=>v).map(([k,v])=>`<div class="detail-item ${String(v).length>80?'full':''}"><span>${k}</span><p>${esc(v)}</p></div>`).join('')}</div><div class="form-section" style="margin-top:18px">项目团队</div><div class="team-list">${team.length?team.map(({assignment,person})=>`<div class="team-row"><div class="avatar-name"><i class="avatar">${esc(initials(person.name))}</i><div><strong>${esc(person.name)}</strong><span>${esc(person.function)}</span></div></div><span>${esc(assignment.role)}</span><strong>${assignment.allocation}%</strong><button class="icon-btn" data-delete-assignment="${assignment.id}">×</button></div>`).join(''):`<div class="empty" style="padding:24px"><p>尚未安排项目人员</p></div>`}</div>`,footer:`<button class="btn btn-outline" data-close-modal>关闭</button><button class="btn btn-soft" id="detail-assign">＋ 添加人员</button><button class="btn btn-primary" id="detail-edit">编辑项目</button>`,onOpen(){
    $('#detail-edit').onclick=()=>editProject(id);$('#detail-assign').onclick=()=>editAssignment({projectId:id});$$('[data-delete-assignment]').forEach(button=>button.onclick=async()=>{const assignment=db.assignments.find(item=>item.id===button.dataset.deleteAssignment);const person=db.people.find(item=>item.id===assignment?.personId);if(!await confirmDialog('移除项目人员',`确定将“${person?.name||'该人员'}”从此项目移除吗？`,true))return;db.assignments=db.assignments.filter(item=>item.id!==button.dataset.deleteAssignment);await persist('项目人员已移除');showProject(id);renderAll();});
  }});
}

function editNeed(id='') {
  if(!db.projects.length){toast('请先新建项目',true);return;}const existing=db.staffingNeeds.find(item=>item.id===id)||{};
  openModal({title:id?'编辑用人需求':'新建用人需求',body:`<form id="need-form" class="form-grid"><div class="field full"><label>项目<em>*</em></label><select name="projectId" required>${db.projects.map(item=>`<option value="${item.id}" ${existing.projectId===item.id?'selected':''}>${esc(item.name)}</option>`).join('')}</select></div><div class="field"><label>所需职能 / 角色<em>*</em></label><input name="role" required value="${esc(existing.role||'')}"></div><div class="field"><label>制作环节</label><select name="stage">${['统筹','剧本','美术','资产','视频','剪辑','交付','其它'].map(v=>`<option ${existing.stage===v?'selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label>所需产能（%）<em>*</em></label><input name="requiredCapacity" type="number" min="1" max="500" required value="${esc(existing.requiredCapacity||50)}"></div><div class="field"><label>期望到岗日期</label><input name="neededBy" type="date" value="${esc(existing.neededBy||'')}"></div><div class="field full"><label>需求说明</label><textarea name="note">${esc(existing.note||'')}</textarea></div></form>`,footer:`<button class="btn btn-outline" data-close-modal>取消</button><button class="btn btn-primary" id="save-need">保存需求</button>`,onOpen(){
    $('#save-need').onclick=async()=>{const form=$('#need-form');if(!form.reportValidity())return;const values=Object.fromEntries(new FormData(form));values.requiredCapacity=Number(values.requiredCapacity);values.status='待安排';if(id)Object.assign(existing,values);else db.staffingNeeds.unshift({id:uid('need'),...values});await persist('用人需求已保存');closeModal();renderAll();};
  }});
}

function editAssignment({projectId='',personId='',needId=''}={}) {
  if(!db.projects.length||!db.people.length){toast('需要先录入项目和人员',true);return;}const need=db.staffingNeeds.find(item=>item.id===needId);if(need)projectId=need.projectId;
  const candidateList=need?availableCandidates(need).map(item=>item.person):db.people.filter(item=>item.employmentStatus!=='离岗');
  if(!candidateList.length){toast('暂无可调度人员',true);return;}if(!personId)personId=candidateList[0].id;
  openModal({title:'添加项目人员',subtitle:need?`为“${need.role}”需求选择可用人员`:'分配比例将实时计入人员产能',size:'medium',body:`<form id="assignment-form" class="form-grid"><div class="field full"><label>项目<em>*</em></label><select name="projectId" ${need?'disabled':''}>${db.projects.map(item=>`<option value="${item.id}" ${projectId===item.id?'selected':''}>${esc(item.name)}</option>`).join('')}</select></div><div class="field full"><label>人员<em>*</em></label><select name="personId">${candidateList.map(person=>`<option value="${person.id}" ${personId===person.id?'selected':''}>${esc(person.name)} · ${esc(person.function)} · 可用 ${personAvailable(db,person)}%</option>`).join('')}</select></div><div class="field"><label>项目角色<em>*</em></label><input name="role" required value="${esc(need?.role||'')}"></div><div class="field"><label>制作环节</label><select name="stage">${['统筹','剧本','美术','资产','视频','剪辑','交付','其它'].map(v=>`<option ${need?.stage===v?'selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label>投入产能（%）<em>*</em></label><input name="allocation" type="number" min="1" max="100" required value="${Math.min(need?Math.max(1,Number(need.requiredCapacity)-needAllocated(db,need)):20,personAvailable(db,db.people.find(p=>p.id===personId))||100)}"></div><div class="field"><label>状态</label><select name="status"><option>进行中</option><option>待开始</option><option>已结束</option></select></div><div class="field"><label>开始日期</label><input name="startDate" type="date" value="${today()}"></div><div class="field"><label>结束日期</label><input name="endDate" type="date" value="${esc(db.projects.find(p=>p.id===(projectId||need?.projectId))?.ddl||'')}"></div><div class="field full"><div class="capacity-preview" id="capacity-preview"></div></div></form>`,footer:`<button class="btn btn-outline" data-close-modal>取消</button><button class="btn btn-primary" id="save-assignment">确认分配</button>`,onOpen(){
    const update=()=>{const person=db.people.find(item=>item.id===$('[name=personId]').value);const available=personAvailable(db,person);const allocation=Number($('[name=allocation]').value||0);$('#capacity-preview').innerHTML=`${esc(person?.name||'')} 当前剩余 <strong>${available}%</strong>；分配后剩余 <strong style="color:${allocation>available?'var(--red)':'var(--mint-dark)'}">${available-allocation}%</strong>${allocation>available?'（将超出标准产能）':''}`;};$('[name=personId]').onchange=update;$('[name=allocation]').oninput=update;update();
    $('#save-assignment').onclick=async()=>{const form=$('#assignment-form');if(!form.reportValidity())return;const values=Object.fromEntries(new FormData(form));values.projectId=need?.projectId||values.projectId;values.allocation=Number(values.allocation);const person=db.people.find(item=>item.id===values.personId);const available=personAvailable(db,person);if(values.allocation>available&&!await confirmDialog('产能将超额',`${person.name} 当前仅剩 ${available}% 产能，仍要分配 ${values.allocation}% 吗？`))return;db.assignments.unshift({id:uid('asg'),needId:needId||'',...values});if(need&&needAllocated(db,need)>=Number(need.requiredCapacity))need.status='已满足';logActivity('人员调度',`${person.name} → ${db.projects.find(p=>p.id===values.projectId)?.name}`);await persist('人员已添加到项目');closeModal();renderAll();};
  }});
}

async function importSheet(kind) {
  const result=await api.importSheet(kind);if(result.canceled)return;if(result.error){toast(result.error,true);return;}const rows=result.rows||[];if(!rows.length){toast('文件中没有可导入的数据',true);return;}const ok=await confirmDialog('确认批量导入',`检测到 ${rows.length} 行${kind==='projects'?'项目':'人员'}数据。重名记录将更新，是否继续？`);if(!ok)return;
  let created=0,updated=0,skipped=0;
  if(kind==='people'){
    for(const row of rows){const values=normalizePersonRow(row);if(!String(values.name||'').trim()){skipped++;continue;}let person=db.people.find(item=>item.name===values.name);if(person){Object.assign(person,values);updated++;}else{person={id:uid('person'),...values};db.people.push(person);created++;}const names=splitNames(row['参与项目']);const total=clampPercent(row['目前参与项目占据产能的百分比']);for(const projectName of names){const project=db.projects.find(item=>item.name===projectName||item.shortName===projectName);if(!project)continue;if(!db.assignments.some(item=>item.personId===person.id&&item.projectId===project.id)){db.assignments.push({id:uid('asg'),projectId:project.id,personId:person.id,role:person.function,stage:'其它',allocation:Math.round(total/Math.max(1,names.length)),startDate:today(),endDate:project.ddl||'',status:'进行中'});}}}
  } else {
    for(const row of rows){const values=normalizeProjectRow(row);if(!String(values.name||'').trim()){skipped++;continue;}let project=db.projects.find(item=>item.name===values.name);if(project){Object.assign(project,values);updated++;}else{project={id:uid('project'),...values};db.projects.push(project);created++;}for(const role of roleColumns(row)){let person=db.people.find(item=>item.name===role.name);if(!person){person={id:uid('person'),name:role.name,department:'待补充',function:role.fallbackFunction,skillLevel:'待补充',capability:'由项目资料导入自动创建，请补充完整人员信息',skills:'',capacity:100,releaseDate:'',employmentStatus:'在岗',contact:'',notes:''};db.people.push(person);}if(!db.assignments.some(item=>item.projectId===project.id&&item.personId===person.id&&item.role===role.role)){db.assignments.push({id:uid('asg'),projectId:project.id,personId:person.id,role:role.role,stage:role.role.includes('资产')?'资产':role.role.includes('视频')?'视频':'统筹',allocation:0,startDate:project.orderDate||'',endDate:project.ddl||'',status:'进行中'});}}
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
  if(action==='restore'){const result=await api.importBackup();if(result?.error){toast(result.error,true);return;}if(result?.canceled)return;if(await confirmDialog('覆盖当前数据','恢复备份会覆盖当前全部数据。确定继续吗？',true)){db={...emptyDatabase(),...result.data};await persist('备份已恢复');renderAll();}}
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
  const editNeedButton=event.target.closest('[data-edit-need]');if(editNeedButton){editNeed(editNeedButton.dataset.editNeed);return;}
  const assignNeed=event.target.closest('[data-assign-need]');if(assignNeed){editAssignment({needId:assignNeed.dataset.assignNeed});return;}
  const assignPerson=event.target.closest('[data-assign-person]');if(assignPerson){editAssignment({personId:assignPerson.dataset.assignPerson});return;}
  const template=event.target.closest('[data-template]');if(template){const result=await api.saveTemplate(template.dataset.template);if(result?.error)toast(result.error,true);else if(!result?.canceled)toast('导入模板已保存');}
});

document.addEventListener('input', event => {
  if(event.target.id==='project-search'){filters.projects=event.target.value;renderProjects();const input=$('#project-search');input?.focus();input?.setSelectionRange(input.value.length,input.value.length);}
  if(event.target.id==='people-search'){filters.people=event.target.value;renderPeople();const input=$('#people-search');input?.focus();input?.setSelectionRange(input.value.length,input.value.length);}
});
document.addEventListener('change', event => {
  if(event.target.id==='project-status-filter'){filters.projectStatus=event.target.value;renderProjects();}
  if(event.target.id==='people-function-filter'){filters.peopleFunction=event.target.value;renderPeople();}
});

$('#quick-project').onclick=()=>editProject();
$('#quick-need').onclick=()=>editNeed();
$('#global-search').addEventListener('keydown',event=>{if(event.key!=='Enter')return;const value=event.target.value.trim();if(!value)return;filters.projects=value;setView('projects');});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeModal();});

db = { ...emptyDatabase(), ...(await api.loadData()) };
renderAll();
