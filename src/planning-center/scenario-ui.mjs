const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

export const SCENARIO_OBJECTIVE_OPTIONS=[
  {id:'balanced',label:'综合改善'},
  {id:'staffing',label:'补齐需求优先'},
  {id:'lowConflict',label:'降低冲突优先'}
];

function options(items,value,label){
  return items.map(item=>`<option value="${esc(value(item))}">${esc(label(item))}</option>`).join('');
}

export function renderScenarioWorkbench(db,{objective='balanced'}={}){
  const projects=db.projects||[];
  const people=(db.people||[]).filter(person=>person.employmentStatus==='在岗');
  const allPeople=db.people||[];
  const assignments=(db.assignments||[]).filter(item=>!['已结束','已取消'].includes(item.status));
  const needs=db.staffingNeeds||[];
  const projectName=id=>projects.find(item=>item.id===id)?.name||'项目已删除';
  const personName=id=>allPeople.find(item=>item.id===id)?.name||'人员已删除';
  return `<div class="scenario-toolbar"><label>比较目标<select id="scenario-objective">${SCENARIO_OBJECTIVE_OPTIONS.map(item=>`<option value="${item.id}" ${item.id===objective?'selected':''}>${esc(item.label)}</option>`).join('')}</select></label><button class="planning-btn primary" id="compare-scenarios">比较全部情景</button><button class="planning-btn" id="clear-scenarios">清空情景</button></div>
  <form id="scenario-builder" class="scenario-builder"><div class="scenario-builder-head"><label>假设类型<select name="kind" id="scenario-kind"><option value="fill">补齐用人需求</option><option value="transfer">转移现有分工</option><option value="person">人员状态 / 产能</option><option value="project">项目日期 / 状态</option></select></label><button class="planning-btn" type="submit">＋ 加入对比</button></div>
    <div class="scenario-fields" data-scenario-kind="fill"><label>用人需求<select name="fillNeedId">${options(needs,item=>item.id,item=>`${projectName(item.projectId)} · ${item.role} · 需求 ${Number(item.requiredCapacity||0)}%`)}</select></label><label>候选人员<select name="fillPersonId">${options(people,item=>item.id,item=>item.name)}</select></label><label>投入产能（留空=当前缺口）<input name="fillAllocation" type="number" min="1" max="100" placeholder="自动"></label></div>
    <div class="scenario-fields" data-scenario-kind="transfer" hidden><label>现有分工<select name="transferAssignmentId">${options(assignments,item=>item.id,item=>`${projectName(item.projectId)} · ${personName(item.personId)} · ${item.role||'分工'} · ${Number(item.allocation||0)}%`)}</select></label><label>转给<select name="transferTargetPersonId">${options(people,item=>item.id,item=>item.name)}</select></label></div>
    <div class="scenario-fields" data-scenario-kind="person" hidden><label>人员<select name="personId" id="scenario-person-select">${options(allPeople,item=>item.id,item=>`${item.name} · ${item.employmentStatus||'在岗'}`)}</select></label><label>模拟状态<select name="personStatus"><option>在岗</option><option>请假</option><option>异动</option><option>离岗</option></select></label><label>标准产能<input name="personCapacity" type="number" min="0" max="300" value="100"></label></div>
    <div class="scenario-fields" data-scenario-kind="project" hidden><label>项目<select name="projectId" id="scenario-project-select">${options(projects,item=>item.id,item=>`${item.name} · ${item.status||''}`)}</select></label><label>启动日期<input name="projectStartDate" type="date"></label><label>DDL<input name="projectDdl" type="date"></label><label>项目状态<select name="projectStatus">${['待启动','制作中','资产制作中','资产制作完成','视频制作中','视频制作完成','反馈修改中','待验收','暂停','已完成','已取消'].map(value=>`<option>${value}</option>`).join('')}</select></label></div>
  </form>`;
}

export function renderScenarioQueue(scenarios=[]){
  if(!scenarios.length)return '<div class="planning-empty compact">先加入至少一个假设情景，再进行 Baseline 对比。</div>';
  return `<div class="scenario-queue">${scenarios.map((scenario,index)=>`<article><span><b>方案 ${index+1}</b><strong>${esc(scenario.label)}</strong><small>${esc(scenario.description||'')}</small></span><em>${scenario.commands?.length||0} 条命令</em><button class="planning-btn small" data-remove-scenario="${esc(scenario.id)}">移除</button></article>`).join('')}</div>`;
}

function delta(value,{inverse=false,suffix=''}={}){
  const number=Number(value||0);
  const cls=number===0?'neutral':(inverse?number<0:number>0)?'good':'bad';
  const sign=number>0?'+':'';
  return `<b class="scenario-delta ${cls}">${sign}${number}${suffix}</b>`;
}

export function renderScenarioComparison(result,{canManage=false}={}){
  if(!result)return '<div class="planning-empty">比较后会显示每个假设相对 Baseline 的需求缺口、冲突和近期可用产能变化。</div>';
  const base=result.baseline.metrics;
  const baseline=`<div class="scenario-baseline"><strong>Baseline</strong><span>待安排 <b>${base.openNeeds}</b></span><span>未解决 <b>${base.unresolvedCapacity}%</b></span><span>冲突人员 <b>${base.conflictPeople}</b></span><span>冲突日 <b>${base.conflictDays}</b></span><span>近期日均可用 <b>${base.primaryAverageAvailable}%</b></span><em>${result.baseline.scenarioScore} 分</em></div>`;
  const cards=result.options.map(option=>{
    if(!option.ok)return `<article class="scenario-result invalid"><header><strong>${esc(option.label)}</strong><b>无效</b></header><p>${esc(option.error||'情景命令无法执行')}</p></article>`;
    const d=option.delta;
    const impact=option.impact;
    return `<article class="scenario-result ${option.rank===1?'recommended':''}" data-scenario-id="${esc(option.id)}"><header><div><span>#${option.rank}</span><strong>${esc(option.label)}</strong>${option.rank===1?'<b>推荐</b>':''}</div><em>${option.scenarioScore} 分 <small>${option.scoreDelta>=0?'+':''}${option.scoreDelta}</small></em></header><p>${esc(option.description||'')}</p><div class="scenario-metrics"><span>待安排${delta(d.openNeeds,{inverse:true})}</span><span>未解决产能${delta(d.unresolvedCapacity,{inverse:true,suffix:'%'})}</span><span>冲突人员${delta(d.conflictPeople,{inverse:true})}</span><span>冲突日${delta(d.conflictDays,{inverse:true})}</span><span>近期可用${delta(d.primaryAverageAvailable,{suffix:'%'})}</span><span>近期利用率${delta(d.primaryUtilization,{inverse:true,suffix:'%'})}</span></div><div class="scenario-explain">${option.explanations.map(text=>`<span>${esc(text)}</span>`).join('')}</div><small class="scenario-impact">分工 +${impact.addedAssignments.length} / -${impact.removedAssignments.length} / 改${impact.changedAssignments.length} · 人员变化 ${impact.changedPeople.length} · 项目变化 ${impact.changedProjects.length}</small>${canManage&&option.commands?.length?`<div class="scenario-actions"><button class="planning-btn small primary" data-apply-scenario="${esc(option.id)}">应用此情景</button></div>`:''}</article>`;
  }).join('');
  return `${baseline}<div class="scenario-result-grid">${cards}</div>`;
}
