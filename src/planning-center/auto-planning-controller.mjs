import { buildDependencyAwareStaffingPlan } from '../planning/dependency-aware-scheduling.mjs';
import {
  buildCriticalPathNeedPriorityModel,
  generateCriticalPathPriorityDraft,
  optimizeCriticalPathPrioritySchedule
} from '../planning/critical-path-priority.mjs';
import { autoScheduleDraftCommands } from '../planning/auto-scheduler.mjs';
import { scheduleOptionCommands } from '../planning/schedule-optimizer.mjs';
import { renderAutoDraft } from './renderers.mjs';
import { renderOptimizerControls, renderOptimizationResult } from './optimizer-ui.mjs';
import { renderDependencyGate } from './dependency-gate-ui.mjs';
import { renderCriticalPriorityQueue } from './critical-priority-ui.mjs';

export function createAutoPlanningController({getDatabase,getStartDate,canManage,applyCommands,showMessage,documentRef=document}={}){
  const $=selector=>documentRef.querySelector(selector);
  const $$=selector=>[...documentRef.querySelectorAll(selector)];
  let plan=null;
  let priorityModel=null;
  let currentDraft=null;
  let currentDraftLabel='';
  let optimizationResult=null;

  function refreshPriorityModel(){
    priorityModel=buildCriticalPathNeedPriorityModel(getDatabase(),{startDate:getStartDate()});
    plan=priorityModel.plan||buildDependencyAwareStaffingPlan(getDatabase(),{startDate:getStartDate()});
    return priorityModel;
  }

  function renderRoots(){
    const gateRoot=$('#planning-dependency-gate');
    const priorityRoot=$('#planning-critical-priority');
    const controls=$('#planning-optimizer-controls');
    const resultRoot=$('#planning-optimizer-result');
    const draftRoot=$('#planning-auto-draft');
    const label=$('#planning-draft-label');
    if(gateRoot)gateRoot.innerHTML=renderDependencyGate(plan);
    if(priorityRoot)priorityRoot.innerHTML=renderCriticalPriorityQueue(priorityModel);
    if(controls)controls.innerHTML=renderOptimizerControls();
    if(resultRoot)resultRoot.innerHTML=renderOptimizationResult(optimizationResult,{canManage:canManage()});
    if(draftRoot)draftRoot.innerHTML=renderAutoDraft(currentDraft,{canManage:canManage()});
    if(label)label.textContent=currentDraftLabel;
    if(optimizationResult&&$('#schedule-objective'))$('#schedule-objective').value=optimizationResult.objective;
    bind();
  }

  function render(){
    if(!priorityModel)refreshPriorityModel();
    renderRoots();
  }

  function reset(){
    plan=null;priorityModel=null;currentDraft=null;currentDraftLabel='';optimizationResult=null;
  }

  function generateDraft(){
    const result=generateCriticalPathPriorityDraft(getDatabase(),{startDate:getStartDate()});
    priorityModel=result.priorityModel;
    plan=priorityModel?.plan||buildDependencyAwareStaffingPlan(getDatabase(),{startDate:getStartDate()});
    currentDraft=result.draft;
    currentDraftLabel='关键路径优先 · 依赖感知快速单方案';
    optimizationResult=null;
    renderRoots();
    if(!result.ok){showMessage(result.error||'项目依赖网络无效',true);return;}
    if(!priorityModel.priorities.length){showMessage(`当前没有可立即排期的需求；${plan.blockedNeeds.length} 条需求被前置项目阻塞`,plan.blockedNeeds.length>0);return;}
    const summary=currentDraft.summary;
    showMessage(`按关键路径优先队列生成 ${summary.proposalCount} 条建议；${plan.blockedNeeds.length} 条阻塞需求未进入草案`);
  }

  function generateOptimization(){
    const objective=$('#schedule-objective')?.value||'balanced';
    const result=optimizeCriticalPathPrioritySchedule(getDatabase(),{objective,startDate:getStartDate()});
    priorityModel=result.priorityModel;
    plan=priorityModel?.plan||buildDependencyAwareStaffingPlan(getDatabase(),{startDate:getStartDate()});
    optimizationResult=result.ok?result:null;
    currentDraft=optimizationResult?.recommended?.draft||null;
    currentDraftLabel=optimizationResult?.recommended?`关键路径优先 · 依赖感知推荐：${optimizationResult.recommended.label}`:'';
    renderRoots();
    if(!result.ok){showMessage(result.error||'关键路径优先级无法生成优化方案',true);return;}
    if(!priorityModel.priorities.length){showMessage(`没有 ready 需求可优化；${plan.blockedNeeds.length} 条需求保持阻塞`,plan.blockedNeeds.length>0);return;}
    if(optimizationResult.recommended)showMessage(`按优先队列比较 ${priorityModel.priorities.length} 条 ready 需求，推荐“${optimizationResult.recommended.label}”；已排除 ${plan.blockedNeeds.length} 条阻塞需求`);
    else showMessage('关键路径门控后暂无可比较方案',true);
  }

  async function applyDraft(draft,label,commands){
    if(!canManage()){showMessage('当前账号只有查看权限，不能修改真实排班',true);return;}
    if(!commands.length)return;
    await applyCommands(commands,draft,label);
  }

  function bind(){
    $('#generate-auto-draft')?.addEventListener('click',generateDraft,{once:true});
    $('#generate-optimized-options')?.addEventListener('click',generateOptimization,{once:true});
    const draftButton=$('#apply-auto-draft');
    if(draftButton&&currentDraft)draftButton.onclick=()=>applyDraft(currentDraft,currentDraftLabel||'关键路径优先排期',autoScheduleDraftCommands(currentDraft));
    if(optimizationResult){
      $$('[data-preview-option]').forEach(button=>button.onclick=()=>{
        const option=optimizationResult.options.find(item=>item.id===button.dataset.previewOption);
        if(!option)return;
        currentDraft=option.draft;
        currentDraftLabel=`关键路径优先 · 依赖感知方案 #${option.rank} · ${option.label}`;
        $$('.optimizer-option').forEach(card=>card.dataset.previewing=String(card.dataset.optionId===option.id));
        const draftRoot=$('#planning-auto-draft');
        if(draftRoot)draftRoot.innerHTML=renderAutoDraft(currentDraft,{canManage:canManage()});
        const label=$('#planning-draft-label');if(label)label.textContent=currentDraftLabel;
        const apply=$('#apply-auto-draft');if(apply)apply.onclick=()=>applyDraft(currentDraft,currentDraftLabel,autoScheduleDraftCommands(currentDraft));
      });
      $$('[data-apply-option]').forEach(button=>button.onclick=()=>{
        const option=optimizationResult.options.find(item=>item.id===button.dataset.applyOption);
        if(option)applyDraft(option.draft,`关键路径优先优化：${option.label}`,scheduleOptionCommands(option));
      });
    }
  }

  function snapshot(){return {plan,priorityModel,currentDraft,currentDraftLabel,optimizationResult};}
  return {render,reset,generateDraft,generateOptimization,snapshot};
}
