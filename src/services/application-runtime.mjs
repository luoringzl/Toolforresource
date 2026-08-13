let activeService=null;
const listeners=new Set();

function emit(event){
  for(const listener of [...listeners]){
    try{listener(event);}catch{}
  }
}

export function registerApplicationService(service){
  activeService=service||null;
  emit({type:'service-ready',service:activeService});
  return activeService;
}

export function getActiveApplicationService(){
  return activeService;
}

export function subscribeApplicationRuntime(listener){
  if(typeof listener!=='function')return ()=>{};
  listeners.add(listener);
  return ()=>listeners.delete(listener);
}

export function notifyApplicationRuntime(event={}){
  emit({type:event.type||'changed',...event,service:activeService});
}
