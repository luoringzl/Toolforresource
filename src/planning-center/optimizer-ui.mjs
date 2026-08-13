const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

export const OPTIMIZER_OBJECTIVE_OPTIONS=[
  {id:'balanced',label:'综合最优'},
  {id:'onTime',label:'按期优先'},
  {id:'lowRisk',label:'低风险优先'},
  {id:'concentrated',label:'少人集中优先'}
];

export function renderOptimizerControls(){
  return `<div class="optimizer-controls"><label>优化目标<select id="schedule-objective">${OPTIMIZER_OBJECTIVE_OPTIONS.map(item=>`<option value="${item.id}">${esc(item.label)}</option>`).join('')}</select></label><button class="planning-btn primary" id="generate-optimized-options">生成多方案</button><button class="planning-btn" id="generate-auto-draft">快速单方案</button></div>`;
}

export function renderOptimizationResult(result,{canManage=false}={}){
  if(!result)return '<div class="planning-empty">选择优化目标后生成多套排期方案，系统会按同一目标函数排序。</div>';
  if(!result.options.length)return '<div class="planning-empty">当前没有可比较的排期方案。</div>';
  return `<div class="optimizer-result"><div class="optimizer-result-head"><div><strong>优化目标：${esc(result.objectiveLabel)}</strong><span>共 ${result.options.length} 个不重复方案</span></div><small>分数越高越符合当前目标</small></div><div class="optimizer-option-grid">${result.options.map(option=>{
    const m=option.metrics;
    return `<article class="optimizer-option ${option.rank===1?'recommended':''}" data-option-id="${esc(option.id)}"><header><div><span>#${option.rank}</span><strong>${esc(option.label)}</strong>${option.rank===1?'<b>推荐</b>':''}</div><em>${esc(option.optimizerScore)} 分</em></header><p>${esc(option.description)}</p><div class="optimizer-metrics"><span>解决需求<b>${m.resolvedNeeds}/${m.requestedNeeds}</b></span><span>未解决<b>${m.unresolvedCapacity}%</b></span><span>延期<b>${m.delayedProposals} 条 / ${m.totalDelayDays} 天</b></span><span>使用人员<b>${m.proposedPeople}</b></span><span>冲突<b>${m.conflictCount}</b></span><span>候选均分<b>${m.averageRecommendationScore}</b></span></div><div class="optimizer-explain">${option.explanations.map(text=>`<span>${esc(text)}</span>`).join('')}</div><div class="optimizer-actions"><button class="planning-btn small" data-preview-option="${esc(option.id)}">查看草案</button>${canManage&&option.draft?.proposals?.length?`<button class="planning-btn small primary" data-apply-option="${esc(option.id)}">应用此方案</button>`:''}</div></article>`;
  }).join('')}</div></div>`;
}
