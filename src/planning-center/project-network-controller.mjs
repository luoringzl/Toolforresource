import {
  addProjectDependency,
  calculateProjectCriticalPath,
  dependencyReadiness,
  removeProjectDependency,
  upsertProjectMilestone
} from '../planning/project-dependencies.mjs';
import {
  renderCriticalPath,
  renderDependencyEditor,
  renderDependencyList,
  renderMilestoneList,
  renderNetworkTable,
  renderProjectNetworkSummary
} from './project-network-ui.mjs';

export function createProjectNetworkController({api,service,canManage,showMessage,documentRef=document}={}){
  const $=selector=>documentRef.querySelector(selector);
  const $$=selector=>[...documentRef.querySelectorAll(selector)];
  let database=null;
  let calculation=null;

  async function loadDatabase(){
    database=await api.loadData();
    return database;
  }

  function calculationWithReadiness(db){
    const result=calculateProjectCriticalPath(db);
    if(!result.ok)return result;
    return {
      ...result,
      nodes:result.nodes.map(node=>({...node,readiness:dependencyReadiness(db,node.project.id)}))
    };
  }

  async function persistProject(updatedProject,label){
    const result=await service.dispatchMany([
      {type:'project.upsert',payload:{id:updatedProject.id,values:updatedProject}}
    ],{label});
    if(!result.ok){showMessage(result.error||'项目网络保存失败',true);return false;}
    const refresh=$('#planning-refresh');
    if(refresh)refresh.click();
    await render();
    showMessage(label);
    return true;
  }

  async function addDependency(form){
    const values=Object.fromEntries(new FormData(form));
    const result=addProjectDependency(database,{
      projectId:values.projectId,predecessorId:values.predecessorId,type:values.type,
      lagDays:Number(values.lagDays||0),note:values.note||''
    });
    if(!result.ok){showMessage(result.error||'依赖关系无效',true);return;}
    await persistProject(result.project,`添加项目依赖：${result.project.name}`);
  }

  async function removeDependency(button){
    const result=removeProjectDependency(database,{
      projectId:button.dataset.removeDependency,
      predecessorId:button.dataset.predecessorId,
      type:button.dataset.dependencyType
    });
    if(!result.ok){showMessage(result.error||'依赖移除失败',true);return;}
    await persistProject(result.project,`移除项目依赖：${result.project.name}`);
  }

  async function addMilestone(form){
    const values=Object.fromEntries(new FormData(form));
    const result=upsertProjectMilestone(database,{
      projectId:values.projectId,label:values.label,date:values.date,type:values.type,status:values.status||''
    });
    if(!result.ok){showMessage(result.error||'里程碑无效',true);return;}
    await persistProject(result.project,`添加项目里程碑：${result.milestone.label}`);
  }

  function bind(){
    const dependencyForm=$('#dependency-form');
    if(dependencyForm)dependencyForm.onsubmit=event=>{event.preventDefault();addDependency(dependencyForm);};
    const milestoneForm=$('#milestone-form');
    if(milestoneForm)milestoneForm.onsubmit=event=>{event.preventDefault();addMilestone(milestoneForm);};
    $$('[data-remove-dependency]').forEach(button=>button.onclick=()=>removeDependency(button));
  }

  async function render(){
    const summary=$('#project-network-summary');
    const critical=$('#project-critical-path');
    const table=$('#project-network-table');
    const editor=$('#project-network-editor');
    const dependencies=$('#project-dependency-list');
    const milestones=$('#project-milestone-list');
    if(!summary||!critical||!table||!editor||!dependencies||!milestones)return;
    await loadDatabase();
    calculation=calculationWithReadiness(database);
    summary.innerHTML=renderProjectNetworkSummary(calculation);
    critical.innerHTML=renderCriticalPath(calculation);
    table.innerHTML=renderNetworkTable(calculation);
    editor.innerHTML=renderDependencyEditor(database,{canManage:canManage()});
    dependencies.innerHTML=renderDependencyList(database,{canManage:canManage()});
    milestones.innerHTML=renderMilestoneList(database);
    bind();
  }

  function snapshot(){return {database,calculation};}
  return {render,snapshot};
}
