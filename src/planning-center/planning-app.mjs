import { createBrowserAPI } from '../services/browser-api.mjs';
import { migrateDatabase } from '../core.mjs';
import { createAppStore } from '../state/app-store.mjs';
import { createApplicationService } from '../services/application-service.mjs';
import {
  buildConfiguredPlanningDashboard,
  buildConfiguredGantt,
  generateConfiguredAutoScheduleDraft,
  resolvePlanningRuntimeConfig
} from '../planning/planning-runtime.mjs';
import { planningDashboardAlerts } from '../planning/planning-dashboard.mjs';
import { autoScheduleDraftCommands } from '../planning/auto-scheduler.mjs';
import { updatePlanningSettings, resetPlanningSettings } from '../services/planning-settings.mjs';
import { planningSettingsFromDatabase } from '../schema/migrations.mjs';
import { localDateKey } from '../utils/date.mjs';
import {
  renderSummary,
  renderHorizonCards,
  renderHeatmap,
  renderAlerts,
  renderConflicts,
  renderNeedRecommendations,
  renderGantt,
  renderAutoDraft,
  renderPlanningSettings,
  renderDatabaseHealth
} from './renderers.mjs';
import { installWorkCalendarFields, readWorkCalendarPatch } from './work-calendar-ui.mjs';

const api=window.desktopAPI||createBrowserAPI();
const store=createAppStore();
const applicationService=createApplicationService({api,store});
const $=(selector,parent=document)=>parent.querySelector(selector);
const $$=(selector,parent=document)=>[...parent.querySelectorAll(selector)];

let currentUser=null;
let dashboardModel=null;
let currentDraft=null;
let resourceOffset=0;
let projectOffset=0;
let currentPlanningView='overview';

const viewTitles={
  overview:'资源总览',gantt:'甘特排期',recommend:'需求推荐',auto:'自动排期',settings:'规划参数',health:'数据健康'
};

const canManage=()=>['admin','manager'].includes(currentUser?.role);
const isAdmin=()=>currentUser?.role==='admin';
const database=()=>store.getDatabase();
const startDate=()=>$('#planning-start-date')?.value||localDateKey(new Date());

function roleLabel(role){
  return ({admin:'高级管理员',manager:'调度管理员',viewer:'只读账号'}[role]||'只读账号');
}

function showMessage(message,error=false){
  const node=$('#planning-message');
  if(!node)return;
  if(!message){node.hidden=true;node.textContent='';node.classList.remove('error');return;}
  node.hidden=false;
  node.textContent=message;
  node.classList.toggle('error',Boolean(error));
  clearTimeout(showMessage.timer);
  showMessage.timer=setTimeout(()=>{node.hidden=true;},4200);
}

function openConfirm(title,text,{confirmLabel='确认',danger=false}={}){
  return new Promise(resolve=>{
    const root=$('#planning-dialog-root');
    root.innerHTML=`<div class="planning-dialog"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p><div class="planning-dialog-actions"><button class="planning-btn" id="planning-confirm-cancel">取消</button><button class="planning-btn ${danger?'danger':'primary'}" id="planning-confirm-ok">${escapeHtml(confirmLabel)}</button></div></div>`;
    const close=value=>{root.innerHTML='';resolve(value);};
    $('#planning-confirm-cancel').onclick=()=>close(false);
    $('#planning-confirm-ok').onclick=()=>close(true);
    root.onclick=event=>{if(event.target===root)close(false);};
  });
}

function escapeHtml(value){
  return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

function updateAccountUI(){
  $('#planning-account-name').textContent=currentUser?.displayName||currentUser?.username||'未登录';
  $('#planning-account-role').textContent=roleLabel(currentUser?.role);
  $('#planning-account-avatar').textContent=String(currentUser?.displayName||currentUser?.username||'?').slice(-1);
}

function setPlanningView(view){
  if(!viewTitles[view])return;
  currentPlanningView=view;
  $$('.planning-nav').forEach(button=>button.classList.toggle('active',button.dataset.planningView===view));
  $$('.planning-view').forEach(section=>section.classList.toggle('active',section.id===`planning-${view}`));
  $('#planning-title').textContent=viewTitles[view];
  if(view==='health')refreshDatabaseHealth();
}

function ganttRangeText(viewport){
  const columns=viewport?.columns||[];
  return columns.length?`${columns[0]} → ${columns.at(-1)}`:'无可见日期';
}

function clampGanttOffset(offset,config){
  const max=Math.max(0,Number(config.ganttDays||0)-Number(config.ganttViewportDays||0));
  return Math.max(0,Math.min(max,Number(offset||0)));
}

function renderGantts(){
  const config=resolvePlanningRuntimeConfig(database(),{startDate:startDate()});
  resourceOffset=clampGanttOffset(resourceOffset,config);
  projectOffset=clampGanttOffset(projectOffset,config);
  const resource=buildConfiguredGantt(database(),{kind:'resource',startDate:startDate(),offset:resourceOffset});
  const project=buildConfiguredGantt(database(),{kind:'project',startDate:startDate(),offset:projectOffset});
  $('#resource-gantt').innerHTML=renderGantt(resource.viewport,{kind:'resource'});
  $('#project-gantt').innerHTML=renderGantt(project.viewport,{kind:'project'});
  $('#resource-gantt-range').textContent=ganttRangeText(resource.viewport);
  $('#project-gantt-range').textContent=ganttRangeText(project.viewport);
}

function renderSettings(){
  const root=$('#planning-settings-root');
  const settings=planningSettingsFromDatabase(database());
  root.innerHTML=renderPlanningSettings(settings);
  const form=$('#planning-settings-form');
  installWorkCalendarFields(form,settings);
  if(!isAdmin()){
    $$('input,textarea,button',form).forEach(control=>control.disabled=true);
    form.insertAdjacentHTML('afterbegin','<div class="planning-empty" style="grid-column:1/-1">规划参数为全局规则，仅高级管理员可修改。</div>');
    return;
  }
  form.onsubmit=async event=>{
    event.preventDefault();
    const values=Object.fromEntries(new FormData(form));
    const patch={
      forecastHorizons:String(values.forecastHorizons||'').split(/[,，\s]+/).map(Number).filter(Boolean),
      defaultForecastDays:Number(values.defaultForecastDays),
      defaultGanttDays:Number(values.defaultGanttDays),
      defaultGanttViewportDays:Number(values.defaultGanttViewportDays),
      recommendationDays:Number(values.recommendationDays),
      autoScheduleDays:Number(values.autoScheduleDays),
      maxPeoplePerNeed:Number(values.maxPeoplePerNeed),
      maxAllocationChunk:Number(values.maxAllocationChunk),
      minAllocationChunk:Number(values.minAllocationChunk),
      allocationStep:Number(values.allocationStep),
      workingDays:$$('[name="workingDays"]:checked',form).map(input=>Number(input.value)),
      ...readWorkCalendarPatch(form)
    };
    const next=updatePlanningSettings(database(),patch);
    if(!next.ok){showMessage(next.error,true);return;}
    const result=await applicationService.replaceDatabase(next.database,{syncAccounts:false});
    if(!result.ok){showMessage(result.error||'规划参数保存失败',true);return;}
    currentDraft=null;resourceOffset=0;projectOffset=0;
    renderPlanning();
    showMessage('规划参数已保存并立即应用');
  };
  $('#reset-planning-settings').onclick=async()=>{
    if(!await openConfirm('恢复规划默认值','将预测、甘特、推荐、自动排期和工作日历参数恢复为系统默认值。'))return;
    const next=resetPlanningSettings(database());
    if(!next.ok){showMessage(next.error,true);return;}
    const result=await applicationService.replaceDatabase(next.database,{syncAccounts:false});
    if(!result.ok){showMessage(result.error||'恢复默认值失败',true);return;}
    currentDraft=null;resourceOffset=0;projectOffset=0;
    renderPlanning();
    showMessage('规划参数已恢复为默认值');
  };
}

function renderPlanning(){
  dashboardModel=buildConfiguredPlanningDashboard(database(),{startDate:startDate()});
  $('#planning-summary').innerHTML=renderSummary(dashboardModel);
  $('#planning-horizons').innerHTML=renderHorizonCards(dashboardModel);
  $('#planning-heatmap').innerHTML=renderHeatmap(dashboardModel);
  $('#planning-alerts').innerHTML=renderAlerts(planningDashboardAlerts(dashboardModel));
  $('#planning-conflicts').innerHTML=renderConflicts(dashboardModel);
  $('#planning-recommendations').innerHTML=renderNeedRecommendations(dashboardModel);
  $('#planning-auto-draft').innerHTML=renderAutoDraft(currentDraft,{canManage:canManage()});
  renderGantts();
  renderSettings();
  bindDraftApply();
}

function bindDraftApply(){
  const button=$('#apply-auto-draft');
  if(!button||!currentDraft)return;
  button.onclick=async()=>{
    if(!canManage()){showMessage('当前账号只有查看权限',true);return;}
    if(!currentDraft.proposals.length)return;
    const delayed=currentDraft.summary.delayedProposals||0;
    const unresolved=currentDraft.summary.unresolvedCapacity||0;
    const warning=[delayed?`${delayed} 条建议会延期`:null,unresolved?`仍有 ${unresolved}% 产能未解决`:null].filter(Boolean).join('；');
    const text=`将一次写入 ${currentDraft.proposals.length} 条项目分工。${warning?`${warning}。`:''}写入会使用单次原子批量提交。`;
    if(!await openConfirm('应用自动排期草案',text,{confirmLabel:'应用草案'}))return;
    const commands=autoScheduleDraftCommands(currentDraft);
    const result=await applicationService.dispatchMany(commands,{now:new Date()});
    if(!result.ok){showMessage(`草案应用失败：${result.error||'未知错误'}`,true);return;}
    currentDraft=null;
    renderPlanning();
    showMessage(`已应用 ${commands.length} 条排期建议`);
  };
}

async function generateDraft(){
  if(!canManage()){showMessage('只读账号不能生成可应用的排期草案',true);return;}
  currentDraft=generateConfiguredAutoScheduleDraft(database(),{startDate:startDate()});
  $('#planning-auto-draft').innerHTML=renderAutoDraft(currentDraft,{canManage:true});
  bindDraftApply();
  const summary=currentDraft.summary;
  showMessage(`草案已生成：${summary.proposalCount} 条建议，${summary.delayedProposals} 条延期，未解决 ${summary.unresolvedCapacity}%`);
}

async function refreshDatabaseHealth(){
  const root=$('#planning-health-root');
  if(!isAdmin()){
    root.innerHTML='<div class="planning-empty">数据库诊断和恢复点仅高级管理员可查看与操作。</div>';
    return;
  }
  try{
    const [diagnostics,points]=await Promise.all([
      typeof api.databaseDiagnostics==='function'?api.databaseDiagnostics():null,
      typeof api.listRecoveryPoints==='function'?api.listRecoveryPoints():[]
    ]);
    root.innerHTML=renderDatabaseHealth(diagnostics,points,{isAdmin:true});
    $$('[data-restore-point]',root).forEach(button=>button.onclick=async()=>{
      const name=button.dataset.restorePoint;
      if(!await openConfirm('恢复数据库版本',`确定恢复“${name}”吗？当前数据库会先自动保存为新的恢复点。`,{confirmLabel:'恢复',danger:true}))return;
      const result=await api.restoreRecoveryPoint(name);
      if(!result?.ok){showMessage(result?.error||'数据库恢复失败',true);return;}
      await applicationService.load();
      currentDraft=null;resourceOffset=0;projectOffset=0;
      renderPlanning();
      await refreshDatabaseHealth();
      showMessage(`数据库已恢复到 ${name}`);
    });
    const clear=$('#clear-recovery-points');
    if(clear)clear.onclick=async()=>{
      if(!await openConfirm('清空自动恢复点','这会删除全部滚动恢复点，但不会删除当前数据库。',{confirmLabel:'清空',danger:true}))return;
      const result=await api.clearRecoveryPoints();
      if(!result?.ok){showMessage(result?.error||'清空恢复点失败',true);return;}
      await refreshDatabaseHealth();
      showMessage(`已清空 ${result.removed||0} 个恢复点`);
    };
  }catch(error){
    root.innerHTML='<div class="planning-empty">数据库诊断读取失败。</div>';
    showMessage(error.message||'数据库诊断读取失败',true);
  }
}

async function reloadFromStorage(){
  try{
    const loaded=migrateDatabase(await api.loadData());
    store.replaceDatabase(loaded,{source:'planning-refresh'});
    currentDraft=null;resourceOffset=0;projectOffset=0;
    renderPlanning();
    if(currentPlanningView==='health')await refreshDatabaseHealth();
    showMessage('规划数据已刷新');
  }catch(error){
    showMessage(error.message||'规划数据刷新失败',true);
  }
}

function bindEvents(){
  $$('.planning-nav').forEach(button=>button.onclick=()=>setPlanningView(button.dataset.planningView));
  $('#planning-refresh').onclick=reloadFromStorage;
  $('#planning-start-date').onchange=()=>{currentDraft=null;resourceOffset=0;projectOffset=0;renderPlanning();};
  $('#generate-auto-draft').onclick=generateDraft;
  $('#refresh-diagnostics').onclick=refreshDatabaseHealth;
  $$('[data-gantt]').forEach(button=>button.onclick=()=>{
    const config=resolvePlanningRuntimeConfig(database(),{startDate:startDate()});
    const delta=config.ganttViewportDays;
    const direction=button.dataset.dir==='next'?1:-1;
    if(button.dataset.gantt==='resource')resourceOffset+=direction*delta;
    else projectOffset+=direction*delta;
    renderGantts();
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape')$('#planning-dialog-root').innerHTML='';
  });
}

async function initialize(){
  try{
    const auth=await api.authStatus();
    if(!auth?.authenticated||!auth.user){
      showMessage('请先在业务工作台登录后再进入规划中心',true);
      setTimeout(()=>{try{window.location.href='index.html';}catch{}},0);
      return;
    }
    currentUser=auth.user;
    updateAccountUI();
    const loaded=migrateDatabase(await api.loadData());
    store.replaceDatabase(loaded,{source:'planning-load'});
    store.setUser(currentUser);
    $('#planning-start-date').value=localDateKey(new Date());
    bindEvents();
    renderPlanning();
    setPlanningView('overview');
  }catch(error){
    showMessage(error.message||'规划中心启动失败',true);
  }
}

await initialize();
