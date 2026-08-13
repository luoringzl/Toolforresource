const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

const TYPE_LABELS={FS:'完成→开始',SS:'开始→开始',FF:'完成→完成',SF:'开始→完成'};

function projectOptions(projects=[],selected=''){
  return projects.map(project=>`<option value="${esc(project.id)}" ${project.id===selected?'selected':''}>${esc(project.name)} · ${esc(project.status||'')}</option>`).join('');
}

export function renderProjectNetworkSummary(result){
  if(!result?.ok)return `<div class="network-error"><strong>依赖网络无效</strong><span>${esc(result?.errors?.[0]?.message||'无法计算关键路径')}</span></div>`;
  const cards=[
    ['网络项目',result.nodes.length],['依赖关系',result.edges.length],['关键项目',result.criticalProjects.length],['网络工期',`${result.networkDurationDays} 工作日`],['计划完成',result.networkFinishDate||'—'],['DDL 风险',result.deadlineRisks.length]
  ];
  return `<div class="network-summary">${cards.map(([label,value])=>`<article><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`).join('')}</div>`;
}

export function renderCriticalPath(result){
  if(!result?.ok||!result.criticalPathIds?.length)return '<div class="planning-empty compact">当前没有可显示的关键路径。</div>';
  const byId=new Map(result.nodes.map(node=>[node.project.id,node]));
  return `<div class="critical-path">${result.criticalPathIds.map((id,index)=>{
    const node=byId.get(id);
    return `${index?'<i>→</i>':''}<article><b>${index+1}</b><span><strong>${esc(node?.project?.name||id)}</strong><small>${esc(node?.plannedStartDate||'')} → ${esc(node?.plannedFinishDate||'')} · ${node?.durationDays||0} 工作日</small></span></article>`;
  }).join('')}</div>`;
}

export function renderNetworkTable(result){
  if(!result?.ok)return `<div class="planning-empty">${esc(result?.errors?.map(item=>item.message).join('；')||'项目依赖网络无效')}</div>`;
  if(!result.nodes.length)return '<div class="planning-empty">暂无项目。</div>';
  return `<div class="network-table"><div class="network-row head"><span>项目</span><span>计划区间</span><span>工期</span><span>浮动</span><span>DDL</span><span>依赖状态</span></div>${result.nodes.map(node=>{
    const readiness=node.readiness;
    const ddlRisk=node.lateByWorkingDays>0?`晚 ${node.lateByWorkingDays} 天`:'正常';
    return `<div class="network-row ${node.critical?'critical':''}"><span><strong>${esc(node.project.name)}</strong><small>${node.critical?'关键项目':'非关键项目'}</small></span><span><b>${esc(node.plannedStartDate)}</b><small>→ ${esc(node.plannedFinishDate)}</small></span><span><b>${node.durationDays}</b><small>工作日</small></span><span><b>${node.totalFloatDays}</b><small>工作日</small></span><span><b class="${node.lateByWorkingDays>0?'risk':''}">${esc(node.project.ddl||'未设置')}</b><small>${ddlRisk}</small></span><span><b>${readiness?.ready?'可启动':'受阻'}</b><small>${readiness?.blockers?.length?`${readiness.blockers.length} 个前置未满足`:'前置条件满足'}</small></span></div>`;
  }).join('')}</div>`;
}

export function renderDependencyEditor(db,{canManage=false}={}){
  const projects=db.projects||[];
  return `<div class="network-editor-grid"><form id="dependency-form" class="network-form"><h3>添加项目依赖</h3><label>后续项目<select name="projectId">${projectOptions(projects)}</select></label><label>前置项目<select name="predecessorId">${projectOptions(projects)}</select></label><label>关系<select name="type"><option value="FS">完成→开始（FS）</option><option value="SS">开始→开始（SS）</option><option value="FF">完成→完成（FF）</option><option value="SF">开始→完成（SF）</option></select></label><label>Lag / Lead（工作日）<input name="lagDays" type="number" min="-3650" max="3650" value="0"></label><label class="wide">备注<input name="note" placeholder="例如：资产验收后 1 个工作日启动"></label><button class="planning-btn primary" type="submit" ${canManage?'':'disabled'}>添加依赖</button></form><form id="milestone-form" class="network-form"><h3>新增自定义里程碑</h3><label>项目<select name="projectId">${projectOptions(projects)}</select></label><label>名称<input name="label" required placeholder="例如：客户中审"></label><label>日期<input name="date" type="date" required></label><label>类型<select name="type"><option value="review">审查</option><option value="delivery">交付</option><option value="approval">确认</option><option value="custom">其它</option></select></label><label class="wide">状态<input name="status" placeholder="例如：待确认"></label><button class="planning-btn primary" type="submit" ${canManage?'':'disabled'}>添加里程碑</button></form></div>`;
}

export function renderDependencyList(db,{canManage=false}={}){
  const byId=new Map((db.projects||[]).map(project=>[project.id,project]));
  const rows=[];
  for(const project of db.projects||[]){
    for(const dependency of project.dependencies||[]){
      const predecessor=byId.get(dependency.predecessorId);
      rows.push({project,dependency,predecessor});
    }
  }
  if(!rows.length)return '<div class="planning-empty compact">还没有跨项目依赖关系。</div>';
  return `<div class="dependency-list">${rows.map(({project,dependency,predecessor})=>`<article><span><strong>${esc(predecessor?.name||'前置项目已删除')}</strong><i>${esc(TYPE_LABELS[dependency.type]||dependency.type)}${Number(dependency.lagDays||0)?` · ${Number(dependency.lagDays)>0?'+':''}${dependency.lagDays} 工作日`:''}</i><strong>${esc(project.name)}</strong><small>${esc(dependency.note||'')}</small></span>${canManage?`<button class="planning-btn small danger" data-remove-dependency="${esc(project.id)}" data-predecessor-id="${esc(dependency.predecessorId)}" data-dependency-type="${esc(dependency.type)}">移除</button>`:''}</article>`).join('')}</div>`;
}

export function renderMilestoneList(db){
  const rows=[];
  for(const project of db.projects||[]){
    for(const item of project.milestones||[])rows.push({project,item});
  }
  rows.sort((a,b)=>String(a.item.date||'').localeCompare(String(b.item.date||''))||a.project.name.localeCompare(b.project.name,'zh-CN'));
  if(!rows.length)return '<div class="planning-empty compact">还没有自定义里程碑；资产完成、视频完成和 DDL 会自动进入关键路径节点。</div>';
  return `<div class="milestone-list">${rows.map(({project,item})=>`<article><time>${esc(item.date||'')}</time><span><strong>${esc(item.label||'里程碑')}</strong><small>${esc(project.name)} · ${esc(item.type||'custom')} ${item.status?`· ${esc(item.status)}`:''}</small></span></article>`).join('')}</div>`;
}
