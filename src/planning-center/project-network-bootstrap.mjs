import { createBrowserAPI } from '../services/browser-api.mjs';
import { getActiveApplicationService, subscribeApplicationRuntime } from '../services/application-runtime.mjs';
import { createProjectNetworkController } from './project-network-controller.mjs';

const api=window.desktopAPI||createBrowserAPI();
const $=selector=>document.querySelector(selector);
const $$=selector=>[...document.querySelectorAll(selector)];
let controller=null;
let currentService=null;
let role='viewer';

function showMessage(message,error=false){
  const node=$('#planning-message');
  if(!node)return;
  node.hidden=false;
  node.textContent=message;
  node.classList.toggle('error',Boolean(error));
  clearTimeout(showMessage.timer);
  showMessage.timer=setTimeout(()=>{node.hidden=true;},4200);
}

function networkActive(){return $('#planning-network')?.classList.contains('active');}

function activateNetwork(){
  $$('.planning-nav').forEach(button=>button.classList.remove('active'));
  $$('.planning-view').forEach(section=>section.classList.remove('active'));
  const button=$('[data-project-network]');
  const section=$('#planning-network');
  if(button)button.classList.add('active');
  if(section)section.classList.add('active');
  const title=$('#planning-title');
  if(title)title.textContent='项目网络 / 关键路径';
  controller?.render();
}

async function mount(service){
  if(!service||service===currentService&&controller)return;
  currentService=service;
  const auth=await api.authStatus();
  role=auth?.user?.role||'viewer';
  controller=createProjectNetworkController({
    api,service,canManage:()=>['admin','manager'].includes(role),showMessage,documentRef:document
  });
  const button=$('[data-project-network]');
  if(button)button.onclick=activateNetwork;
  if(networkActive())controller.render();
}

const active=getActiveApplicationService();
if(active)await mount(active);
subscribeApplicationRuntime(event=>{
  if(event.type==='service-ready')mount(event.service);
  else if(networkActive())controller?.render();
});
