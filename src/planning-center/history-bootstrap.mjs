import { createBrowserAPI } from '../services/browser-api.mjs';
import { getActiveApplicationService, subscribeApplicationRuntime } from '../services/application-runtime.mjs';
import { createHistoryController } from './history-controller.mjs';

const api=window.desktopAPI||createBrowserAPI();
const $=selector=>document.querySelector(selector);
let controller=null;
let currentService=null;

function showMessage(message,error=false){
  const node=$('#planning-message');
  if(!node)return;
  node.hidden=false;
  node.textContent=message;
  node.classList.toggle('error',Boolean(error));
  clearTimeout(showMessage.timer);
  showMessage.timer=setTimeout(()=>{node.hidden=true;},4200);
}

function escapeHtml(value){
  return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

function confirmAction(title,text,{confirmLabel='确认'}={}){
  return new Promise(resolve=>{
    const root=$('#planning-dialog-root');
    if(!root){resolve(window.confirm(text));return;}
    root.innerHTML=`<div class="planning-dialog"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p><div class="planning-dialog-actions"><button class="planning-btn" id="history-confirm-cancel">取消</button><button class="planning-btn primary" id="history-confirm-ok">${escapeHtml(confirmLabel)}</button></div></div>`;
    const close=value=>{root.innerHTML='';resolve(value);};
    $('#history-confirm-cancel').onclick=()=>close(false);
    $('#history-confirm-ok').onclick=()=>close(true);
    root.onclick=event=>{if(event.target===root)close(false);};
  });
}

async function redrawPlanning(){
  const refresh=$('#planning-refresh');
  if(refresh){refresh.click();await new Promise(resolve=>setTimeout(resolve,10));}
}

async function mount(service){
  if(!service||service===currentService&&controller)return;
  currentService=service;
  const auth=await api.authStatus();
  const role=auth?.user?.role||'viewer';
  controller=createHistoryController({
    service,
    canManage:()=>['admin','manager'].includes(role),
    confirmAction,
    onDatabaseChanged:redrawPlanning,
    showMessage,
    documentRef:document
  });
  controller.render();
}

const active=getActiveApplicationService();
if(active)await mount(active);
subscribeApplicationRuntime(event=>{
  if(event.type==='service-ready')mount(event.service);
  else controller?.render();
});
