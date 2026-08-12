const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const pct=value=>`${Math.round(Number(value||0))}%`;

function dateLabel(value=''){
  const match=String(value).match(/^\d{4}-(\d{2})-(\d{2})$/);
  return match?`${Number(match[1])}/${Number(match[2])}`:value;
}

export function renderSummary(model){
  const cards=[
    ['执行项目',model.summary.activeProjects,'当前仍需人员与产能'],
    ['待安排需求',model.summary.openNeeds,'尚有明确产能缺口'],
    ['冲突人员',model.summary.conflictPeople,'未来窗口内出现超载'],
    ['冲突日期',model.summary.conflictDays,'至少一人超过标准产能']
  ];
  return `<div class="planning-metrics">${cards.map(([label,value,note])=>`<article class="planning-metric"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`).join('')}</div>`;
}

export function renderHorizonCards(model){
  return `<div class="horizon-grid">${model.horizonCards.map(card=>`<article class="horizon-card"><div><strong>${card.days} 天</strong><span>团队产能预测</span></div><div class="horizon-stats"><span>利用率 <b>${pct(card.utilization)}</b></span><span>日均可用 <b>${pct(card.averageAvailable)}</b></span><span>峰值占用 <b>${pct(card.peakUsage)}</b></span><span>冲突天数 <b>${card.overloadedDays}</b></span></div></article>`).join('')}</div>`;
}

export function renderHeatmap(model){
  return `<div class="heatmap" aria-label="团队产能热力图">${model.heatmap.map(day=>`<button class="heat-cell ${esc(day.level)}" data-heat-date="${esc(day.date)}" title="${esc(day.date)} · 利用率 ${pct(day.utilization)} · 可用 ${pct(day.available)} · 超载人员 ${day.overloadedPeople}"><span>${dateLabel(day.date)}</span><b>${pct(day.utilization)}</b></button>`).join('')}</div><div class="heat-legend"><span><i class="low"></i>低负载</span><span><i class="medium"></i>中负载</span><span><i class="high"></i>高负载</span><span><i class="critical"></i>接近满载</span><span><i class="overload"></i>发生超载</span></div>`;
}

export function renderAlerts(alerts=[]){
  if(!alerts.length)return '<div class="planning-empty">当前没有需要优先处理的规划告警。</div>';
  return `<div class="alert-list">${alerts.map(alert=>`<article class="planning-alert ${esc(alert.severity)}"><div><strong>${esc(alert.title)}</strong><span>${esc(alert.text)}</span></div><b>${esc(({critical:'严重',high:'高',warning:'注意'}[alert.severity]||'提示'))}</b></article>`).join('')}</div>`;
}

export function renderConflicts(model){
  if(!model.conflictPeople.length)return '<div class="planning-empty">未来规划窗口内没有人员超载。</div>';
  return `<div class="conflict-list">${model.conflictPeople.map(item=>`<article class="conflict-row ${esc(item.severity)}"><div class="conflict-person"><strong>${esc(item.person?.name||'未知人员')}</strong><span>${esc(item.firstDate)} → ${esc(item.lastDate)}</span></div><div class="conflict-stat"><span>超载天数<b>${item.days.length}</b></span><span>峰值占用<b>${pct(item.maxUsage)}</b></span><span>最大超额<b>+${pct(item.maxOverload)}</b></span></div></article>`).join('')}</div>`;
}

function candidateTag(candidate){
  const tags=[];
  if(candidate.positionMatch)tags.push('<span class="match direct">职位匹配</span>');
  if(candidate.skillMatch)tags.push('<span class="match skill">技能匹配</span>');
  if(candidate.feasible)tags.push('<span class="match feasible">无超载</span>');
  return tags.join('');
}

export function renderNeedRecommendations(model){
  if(!model.needRecommendations.length)return '<div class="planning-empty">当前没有待安排用人需求。</div>';
  return `<div class="recommendation-list">${model.needRecommendations.map(item=>`<article class="need-recommendation"><header><div><strong>${esc(item.project?.name||'项目已删除')} · ${esc(item.need.role)}</strong><span>缺口 ${pct(item.need.gap)} · 期望 ${esc(item.need.neededBy||'尽快')}</span></div><b>${item.candidates.length?`${item.candidates.length} 个候选`:'暂无候选'}</b></header><div class="candidate-list">${item.candidates.length?item.candidates.map(candidate=>`<div class="recommend-candidate"><div class="candidate-rank">#${candidate.rank}</div><div class="candidate-main"><strong>${esc(candidate.person.name)} <em>${candidate.score} 分</em></strong><div>${candidateTag(candidate)}</div><small>${esc(candidate.reasons.join('；')||'暂无正向说明')}</small>${candidate.risks.length?`<small class="risk-copy">${esc(candidate.risks.join('；'))}</small>`:''}</div><div class="candidate-capacity"><span>最早可用</span><b>${esc(candidate.firstAvailableDate||'窗口外')}</b><span>平均可用 ${pct(candidate.averageAvailable)}</span></div></div>`).join(''):'<div class="planning-empty compact">当前窗口内没有在岗且可行的候选人。</div>'}</div></article>`).join('')}</div>`;
}

function resourceGanttRow(row,columns){
  const barRows=Math.max(1,row.bars?.length||0);
  const totalRows=barRows+1;
  const cells=row.capacity.map(day=>`<i class="capacity-cell ${day.overloaded?'overload':day.available<=0?'full':day.available<30?'tight':day.available<70?'busy':'free'}" style="grid-column:${columns.indexOf(day.date)+1};grid-row:${totalRows}" title="${esc(day.date)} · 占用 ${pct(day.usage)} · 可用 ${pct(day.available)}"></i>`).join('');
  const bars=(row.bars||[]).map((bar,index)=>`<div class="gantt-bar ${bar.type}" style="grid-column:${bar.viewportStart+1}/${bar.viewportEnd+2};grid-row:${index+1}" title="${esc(bar.name)} · ${esc(bar.role)} · ${pct(bar.allocation)}"><strong>${esc(bar.name)}</strong><span>${esc(bar.role)} · ${pct(bar.allocation)}</span></div>`).join('');
  return `<div class="gantt-row"><div class="gantt-label"><strong>${esc(row.label)}</strong><span>${esc(row.person?.position||row.person?.function||'')}</span></div><div class="gantt-track" style="--cols:${columns.length};--rows:${totalRows}">${bars}${cells}</div></div>`;
}

function projectGanttRow(row,columns){
  const main=row.bar?`<div class="gantt-bar project" style="grid-column:${Math.max(0,row.bar.startIndex)+1}/${Math.min(columns.length-1,row.bar.endIndex)+2};grid-row:1"><strong>${esc(row.label)}</strong><span>${esc(row.project.status||'')}</span></div>`:'';
  const assignments=(row.assignments||[]).map((bar,index)=>`<div class="gantt-bar assignment" style="grid-column:${bar.viewportStart+1}/${bar.viewportEnd+2};grid-row:${index+2}" title="${esc(bar.role)} · ${pct(bar.allocation)}"><span>${esc(bar.role)} · ${pct(bar.allocation)}</span></div>`).join('');
  const milestones=(row.milestones||[]).map(item=>`<i class="gantt-milestone ${esc(item.type)}" style="grid-column:${item.viewportIndex+1};grid-row:1/-1" title="${esc(item.label)} ${esc(item.date)}"><b></b></i>`).join('');
  const rows=Math.max(2,(row.assignments?.length||0)+1);
  return `<div class="gantt-row"><div class="gantt-label"><strong>${esc(row.label)}</strong><span>DDL ${esc(row.project.ddl||'未设置')}</span></div><div class="gantt-track" style="--cols:${columns.length};--rows:${rows}">${main}${assignments}${milestones}</div></div>`;
}

export function renderGantt(viewport,{kind='resource'}={}){
  const columns=viewport.columns||[];
  if(!columns.length)return '<div class="planning-empty">当前没有甘特图日期范围。</div>';
  const rows=viewport.rows||[];
  return `<div class="gantt-shell"><div class="gantt-head"><div class="gantt-label head">${kind==='resource'?'人员 / 产能':'项目 / DDL'}</div><div class="gantt-days" style="--cols:${columns.length}">${columns.map(date=>`<span title="${esc(date)}">${dateLabel(date)}</span>`).join('')}</div></div><div class="gantt-body">${rows.length?rows.map(row=>kind==='project'?projectGanttRow(row,columns):resourceGanttRow(row,columns)).join(''):'<div class="planning-empty">没有可显示的数据。</div>'}</div></div>`;
}

export function renderAutoDraft(draft,{canManage=false}={}){
  if(!draft)return '<div class="planning-empty">点击“生成排期草案”后，系统会在模拟数据中安排待处理需求，不会立即修改真实排班。</div>';
  const summary=`<div class="draft-summary"><span>建议 <b>${draft.summary.proposalCount}</b> 条</span><span>涉及 <b>${draft.summary.proposedPeople}</b> 人</span><span>建议产能 <b>${pct(draft.summary.allocatedCapacity)}</b></span><span>延期 <b>${draft.summary.delayedProposals}</b> 条</span><span>未解决 <b>${pct(draft.summary.unresolvedCapacity)}</b></span></div>`;
  const proposals=draft.proposals.length?`<div class="draft-table"><div class="draft-row head"><span>项目 / 需求</span><span>人员</span><span>投入</span><span>建议日期</span><span>状态</span></div>${draft.proposals.map(item=>`<div class="draft-row"><span><strong>${esc(item.projectName)}</strong><small>${esc(item.role)}</small></span><span><strong>${esc(item.personName)}</strong><small>${esc(item.reasons.slice(0,2).join('；'))}</small></span><span><b>${pct(item.allocation)}</b></span><span><strong>${esc(item.startDate)}</strong><small>${item.meetsRequestedStart?'按期':`期望 ${esc(item.requestedStartDate)}`}</small></span><span>${item.meetsRequestedStart?'<b class="draft-ok">按期</b>':`<b class="draft-delay">延期 ${item.delayDays} 天</b>`}</span></div>`).join('')}</div>`:'<div class="planning-empty compact">没有生成可行建议。</div>';
  const unresolved=draft.unresolved.length?`<div class="draft-unresolved"><strong>仍未解决</strong>${draft.unresolved.map(item=>`<span>${esc(item.projectName)} · ${esc(item.role)}：仍缺 ${pct(item.remaining)}（${esc(item.reason)}）</span>`).join('')}</div>`:'';
  const action=canManage&&draft.proposals.length?'<button class="planning-btn primary" id="apply-auto-draft">应用草案到真实排班</button>':'';
  return `${summary}${proposals}${unresolved}<div class="draft-actions">${action}<span>${draft.feasible?'草案不存在超载冲突':'草案仍有未解决项或冲突，应用前请检查'}</span></div>`;
}

export function renderPlanningSettings(settings){
  const weekdayLabels=['日','一','二','三','四','五','六'];
  return `<form id="planning-settings-form" class="planning-form"><div class="form-card"><h3>预测与甘特图</h3><label>预测周期（天，逗号分隔）<input name="forecastHorizons" value="${esc(settings.forecastHorizons.join(','))}"></label><label>默认预测天数<input name="defaultForecastDays" type="number" min="1" value="${settings.defaultForecastDays}"></label><label>甘特总窗口（天）<input name="defaultGanttDays" type="number" min="1" value="${settings.defaultGanttDays}"></label><label>甘特可视窗口（天）<input name="defaultGanttViewportDays" type="number" min="1" value="${settings.defaultGanttViewportDays}"></label></div><div class="form-card"><h3>推荐与自动排期</h3><label>推荐搜索窗口（天）<input name="recommendationDays" type="number" min="1" value="${settings.recommendationDays}"></label><label>自动排期窗口（天）<input name="autoScheduleDays" type="number" min="1" value="${settings.autoScheduleDays}"></label><label>单需求最大建议人数<input name="maxPeoplePerNeed" type="number" min="1" max="20" value="${settings.maxPeoplePerNeed}"></label><label>最大单人投入（%）<input name="maxAllocationChunk" type="number" min="1" max="100" value="${settings.maxAllocationChunk}"></label><label>最小单人投入（%）<input name="minAllocationChunk" type="number" min="1" max="100" value="${settings.minAllocationChunk}"></label><label>投入递减步长（%）<input name="allocationStep" type="number" min="1" max="100" value="${settings.allocationStep}"></label></div><div class="form-card full"><h3>工作日</h3><div class="weekday-options">${weekdayLabels.map((label,index)=>`<label><input type="checkbox" name="workingDays" value="${index}" ${settings.workingDays.includes(index)?'checked':''}><span>周${label}</span></label>`).join('')}</div><p>当前工作日字段已纳入 V7 配置；后续日历/节假日模块会继续细化。</p></div><div class="form-actions"><button type="button" class="planning-btn" id="reset-planning-settings">恢复默认</button><button type="submit" class="planning-btn primary">保存规划参数</button></div></form>`;
}

export function renderDatabaseHealth(diagnostics,recoveryPoints=[],{isAdmin=false}={}){
  if(!diagnostics)return '<div class="planning-empty">当前环境没有数据库诊断信息。</div>';
  const health=diagnostics.valid!==false?'正常':'异常';
  const points=recoveryPoints.length?recoveryPoints.map(point=>`<div class="recovery-row"><span><strong>${esc(point.name)}</strong><small>${esc(point.modifiedAt)} · ${(Number(point.sizeBytes||0)/1024).toFixed(1)} KB · V${point.version||'?'}</small></span>${isAdmin?`<button class="planning-btn small" data-restore-point="${esc(point.name)}">恢复</button>`:''}</div>`).join(''):'<div class="planning-empty compact">暂无自动恢复点；数据库发生第一次覆盖保存后会自动创建。</div>';
  return `<div class="health-grid"><article><span>数据库状态</span><strong>${health}</strong><small>V${diagnostics.version||'?'} · ${(Number(diagnostics.sizeBytes||0)/1024).toFixed(1)} KB</small></article><article><span>最近写入</span><strong>${esc(diagnostics.updatedAt||diagnostics.modifiedAt||'未写入')}</strong><small>${diagnostics.sha256?`SHA-256 ${esc(diagnostics.sha256.slice(0,12))}…`:'暂无哈希'}</small></article><article><span>自动恢复点</span><strong>${diagnostics.recoveryCount??recoveryPoints.length}</strong><small>默认保留最近 5 个版本</small></article></div><div class="recovery-list"><div class="section-mini-head"><strong>恢复点</strong>${isAdmin&&recoveryPoints.length?'<button class="planning-btn small danger" id="clear-recovery-points">清空恢复点</button>':''}</div>${points}</div>`;
}
