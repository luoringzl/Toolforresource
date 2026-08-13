const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

export function renderDependencyGate(plan){
  if(!plan)return '<div class="planning-empty compact">正在读取项目依赖门控。</div>';
  if(!plan.ok)return `<div class="dependency-gate invalid"><strong>依赖网络无效</strong><span>${esc(plan.error||'无法生成自动排期')}</span></div>`;
  const s=plan.summary;
  const blocked=plan.blockedPreview||[];
  const alerts=plan.alerts||[];
  return `<div class="dependency-gate"><div class="dependency-gate-summary"><article><span>开放需求</span><strong>${s.openNeeds}</strong></article><article><span>现在可排</span><strong>${s.eligibleNeeds}</strong><small>${s.eligibleCapacity}% 产能</small></article><article><span>前置阻塞</span><strong>${s.blockedNeeds}</strong><small>${s.blockedCapacity}% 产能</small></article><article><span>关键路径缺口</span><strong>${s.criticalOpenNeeds}</strong></article></div>${blocked.length?`<div class="blocked-needs"><div class="section-mini-head"><strong>被前置项目阻塞的需求</strong><span>不会进入任何可应用自动排期方案</span></div>${blocked.map(item=>`<article><div><strong>${esc(item.projectName)} · ${esc(item.role)}</strong><span>仍缺 ${item.gap}% · 预计最早 ${esc(item.earliestStaffingDate||'待计算')}</span></div><div class="blockers">${item.blockers.map(blocker=>`<span>${esc(blocker.predecessorName)} · ${esc(blocker.type)} · ${esc(blocker.predecessorStatus||'未启动')}</span>`).join('')}</div></article>`).join('')}</div>`:'<div class="dependency-ready-note">当前开放需求均已通过项目依赖门控，可进入自动排期。</div>'}${alerts.length?`<div class="dependency-alerts">${alerts.slice(0,6).map(alert=>`<span class="${esc(alert.severity)}">${esc(alert.title)}：${esc(alert.text)}</span>`).join('')}</div>`:''}</div>`;
}
