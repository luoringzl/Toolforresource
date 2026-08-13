import { renderAuditDrawer, renderHistoryButtons } from './history-ui.mjs';

export function createHistoryController({service,canManage,confirmAction,onDatabaseChanged,showMessage,documentRef=document}={}){
  let auditOpen=false;
  const $=selector=>documentRef.querySelector(selector);

  function status(){return service.historyStatus();}

  function render(){
    const controls=$('#planning-history-controls');
    const drawer=$('#planning-history-root');
    if(controls)controls.innerHTML=renderHistoryButtons(status());
    if(drawer)drawer.innerHTML=renderAuditDrawer(service.auditTrail({limit:200}),{open:auditOpen});
    bind();
  }

  async function perform(direction){
    if(!canManage()){showMessage('当前账号只有查看权限，不能撤销或重做',true);return;}
    const current=status();
    const transaction=direction==='undo'?current.nextUndo:current.nextRedo;
    if(!transaction)return;
    const verb=direction==='undo'?'撤销':'重做';
    const approved=await confirmAction(`${verb}操作`,`${verb}“${transaction.label}”？这会作为新的审计事件持久记录。`,{confirmLabel:verb});
    if(!approved)return;
    const result=direction==='undo'?await service.undo():await service.redo();
    if(!result.ok){showMessage(result.error||`${verb}失败`,true);render();return;}
    await onDatabaseChanged?.({direction,transaction:result.transaction});
    showMessage(`${verb}完成：${result.transaction?.label||'数据变更'}`);
    render();
  }

  function bind(){
    const undo=$('#planning-undo');
    const redo=$('#planning-redo');
    const toggle=$('#planning-audit-toggle');
    if(undo){undo.disabled=undo.disabled||!canManage();undo.onclick=()=>perform('undo');}
    if(redo){redo.disabled=redo.disabled||!canManage();redo.onclick=()=>perform('redo');}
    if(toggle)toggle.onclick=()=>{auditOpen=!auditOpen;render();};
    $('#planning-audit-close')?.addEventListener('click',()=>{auditOpen=false;render();});
    $('#planning-audit-backdrop')?.addEventListener('click',()=>{auditOpen=false;render();});
  }

  function close(){auditOpen=false;render();}
  return {render,close,status};
}
