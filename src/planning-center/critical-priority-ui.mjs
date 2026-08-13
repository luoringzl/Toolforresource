const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

export function renderCriticalPriorityQueue(model){
  if(!model)return '<div class="planning-empty compact">正在计算 ready 需求优先级。</div>';
  if(!model.ok)return `<div class="priority-queue invalid"><strong>优先队列不可用</strong><span>${esc(model.error||'项目依赖网络无效')}</span></div>`;
  if(!model.priorities.length)return '<div class="planning-empty compact">当前没有 dependency-ready 的开放需求。</div>';
  return `<div class="priority-queue"><div class="priority-queue-head"><strong>Ready 需求优先队列</strong><span>关键路径 / DDL 风险 / 业务优先级 / 浮动时间 / 缺口</span></div>${model.priorities.map((item,index)=>`<article class="priority-row ${item.critical?'critical':''}"><b>#${index+1}</b><div class="priority-main"><strong>${esc(item.project.name)} · ${esc(item.need.role)}</strong><span>${item.priorityReasons.map(reason=>`<i>${esc(reason)}</i>`).join('')}</span></div><div class="priority-score"><strong>${esc(item.priorityScore)}</strong><small>优先分</small></div><div class="priority-meta"><span>缺口 <b>${item.gap}%</b></span><span>最早 <b>${esc(item.earliestStaffingDate||'待定')}</b></span>${item.state?.node?.totalFloatDays>0?`<span>浮动 <b>${item.state.node.totalFloatDays} 天</b></span>`:''}</div></article>`).join('')}</div>`;
}
