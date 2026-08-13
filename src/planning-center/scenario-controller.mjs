import { comparePlanningScenarios, scenarioCommands } from '../planning/scenario-comparison.mjs';
import {
  createFillNeedScenario,
  createTransferAssignmentScenario,
  createPersonCapacityScenario,
  createProjectDatesScenario
} from '../planning/scenario-presets.mjs';
import { renderScenarioWorkbench, renderScenarioQueue, renderScenarioComparison } from './scenario-ui.mjs';

export function createScenarioController({getDatabase,getStartDate,canManage,applyCommands,showMessage,documentRef=document}={}){
  let scenarios=[];
  let comparison=null;
  let objective='balanced';
  const $=selector=>documentRef.querySelector(selector);
  const $$=selector=>[...documentRef.querySelectorAll(selector)];

  function syncKind(){
    const kind=$('#scenario-kind')?.value||'fill';
    $$('[data-scenario-kind]').forEach(node=>{node.hidden=node.dataset.scenarioKind!==kind;});
  }

  function syncPersonFields(){
    const form=$('#scenario-builder');
    if(!form)return;
    const person=getDatabase().people.find(item=>item.id===form.elements.personId?.value);
    if(!person)return;
    form.elements.personStatus.value=person.employmentStatus||'在岗';
    form.elements.personCapacity.value=Number(person.capacity||100);
  }

  function syncProjectFields(){
    const form=$('#scenario-builder');
    if(!form)return;
    const project=getDatabase().projects.find(item=>item.id===form.elements.projectId?.value);
    if(!project)return;
    form.elements.projectStartDate.value=project.startDate||'';
    form.elements.projectDdl.value=project.ddl||'';
    if([...form.elements.projectStatus.options].some(option=>option.value===project.status))form.elements.projectStatus.value=project.status;
  }

  function buildScenario(form){
    const kind=form.elements.kind.value;
    if(kind==='fill')return createFillNeedScenario(getDatabase(),{
      needId:form.elements.fillNeedId.value,
      personId:form.elements.fillPersonId.value,
      allocation:form.elements.fillAllocation.value||undefined
    });
    if(kind==='transfer')return createTransferAssignmentScenario(getDatabase(),{
      assignmentId:form.elements.transferAssignmentId.value,
      targetPersonId:form.elements.transferTargetPersonId.value
    });
    if(kind==='person')return createPersonCapacityScenario(getDatabase(),{
      personId:form.elements.personId.value,
      employmentStatus:form.elements.personStatus.value,
      capacity:form.elements.personCapacity.value
    });
    if(kind==='project')return createProjectDatesScenario(getDatabase(),{
      projectId:form.elements.projectId.value,
      startDate:form.elements.projectStartDate.value,
      ddl:form.elements.projectDdl.value,
      status:form.elements.projectStatus.value
    });
    return {ok:false,error:'不支持的情景类型'};
  }

  function bind(){
    const form=$('#scenario-builder');
    const kind=$('#scenario-kind');
    if(kind)kind.onchange=syncKind;
    $('#scenario-person-select')?.addEventListener('change',syncPersonFields);
    $('#scenario-project-select')?.addEventListener('change',syncProjectFields);
    if(form)form.onsubmit=event=>{
      event.preventDefault();
      const result=buildScenario(form);
      if(!result.ok){showMessage(result.error,true);return;}
      scenarios=[...scenarios.filter(item=>item.id!==result.scenario.id),result.scenario];
      comparison=null;
      render();
      showMessage(`已加入情景：${result.scenario.label}`);
    };
    $('#compare-scenarios')?.addEventListener('click',()=>{
      if(!scenarios.length){showMessage('请先加入至少一个情景',true);return;}
      objective=$('#scenario-objective')?.value||'balanced';
      comparison=comparePlanningScenarios(getDatabase(),scenarios,{startDate:getStartDate(),objective});
      render();
      if(comparison.recommended)showMessage(`比较完成，推荐“${comparison.recommended.label}”`);
    });
    $('#clear-scenarios')?.addEventListener('click',()=>{
      scenarios=[];comparison=null;render();showMessage('情景列表已清空');
    });
    $$('[data-remove-scenario]').forEach(button=>button.onclick=()=>{
      scenarios=scenarios.filter(item=>item.id!==button.dataset.removeScenario);
      comparison=null;render();
    });
    $$('[data-apply-scenario]').forEach(button=>button.onclick=()=>{
      const option=comparison?.options?.find(item=>item.id===button.dataset.applyScenario&&item.ok);
      if(!option)return;
      applyCommands(scenarioCommands(option),null,`情景“${option.label}”`);
    });
    syncKind();
    syncPersonFields();
    syncProjectFields();
  }

  function render(){
    const workbench=$('#planning-scenario-workbench');
    const queue=$('#planning-scenario-queue');
    const results=$('#planning-scenario-results');
    if(!workbench||!queue||!results)return;
    workbench.innerHTML=renderScenarioWorkbench(getDatabase(),{objective});
    queue.innerHTML=renderScenarioQueue(scenarios);
    results.innerHTML=renderScenarioComparison(comparison,{canManage:canManage()});
    bind();
  }

  function reset(){scenarios=[];comparison=null;objective='balanced';}
  function snapshot(){return {scenarios:[...scenarios],comparison,objective};}

  return {render,reset,snapshot};
}
