import { executeResourceCommand } from './resource-commands.mjs';
import { cloneDatabase, normalizeDatabase } from '../schema/database.mjs';
import {
  appendCommandAudit,
  commandAuditTrail,
  createCommandHistory,
  restoreSnapshotPreservingAudit
} from './command-history.mjs';
import { notifyApplicationRuntime, registerApplicationService } from './application-runtime.mjs';

async function runEffects(api,database,effects=[]){
  const results=[];
  const unique=[...new Map(effects.map(effect=>[effect.type,effect])).values()];
  for(const effect of unique){
    if(effect.type==='syncPeopleAccounts'&&typeof api.syncPeopleAccounts==='function'){
      results.push({type:effect.type,result:await api.syncPeopleAccounts(database.people)});
    }
  }
  return results;
}

function actorFrom(store,options={}){
  const actor=options.actor||store.getState()?.user||null;
  return actor?{id:actor.id||'',username:actor.username||'',displayName:actor.displayName||actor.name||actor.username||''}:null;
}

function eventDate(options={}){
  if(options.now instanceof Date)return options.now;
  if(options.now){const value=new Date(options.now);if(Number.isFinite(value.getTime()))return value;}
  return new Date();
}

export function createApplicationService({api,store,history=createCommandHistory()}={}){
  if(!api)throw new Error('Application Service 需要 platform api');
  if(!store)throw new Error('Application Service 需要 app store');

  async function persistTransaction({before,after,commands,effects=[],options={},source='command',label=''}){
    const actor=actorFrom(store,options);
    const transaction=history.createTransaction({before,after,commands,actor,source,label});
    const audited=appendCommandAudit(after,{transaction,action:'commit',actor,at:eventDate(options)});
    const saved=await api.saveData(audited);
    if(saved?.ok===false)return {ok:false,error:saved.error||'数据保存失败',code:'PERSIST_FAILED'};
    history.commit(transaction);
    store.replaceDatabase(audited,{source,transactionId:transaction.id,commands:commands.map(command=>command.type)});
    const effectResults=await runEffects(api,audited,effects);
    const summary=history.status().nextUndo;
    notifyApplicationRuntime({type:'history-changed',action:'commit',transaction:summary,database:audited});
    return {ok:true,database:audited,effectResults,saved,transaction:summary};
  }

  async function restoreHistoryTransaction(direction,options={}){
    const transaction=direction==='undo'?history.peekUndo():history.peekRedo();
    if(!transaction)return {ok:false,error:direction==='undo'?'没有可撤销的操作':'没有可重做的操作',code:direction==='undo'?'UNDO_EMPTY':'REDO_EMPTY'};
    const current=store.getDatabase();
    const snapshot=direction==='undo'?transaction.before:transaction.after;
    const restored=restoreSnapshotPreservingAudit(snapshot,current);
    const actor=actorFrom(store,options);
    const audited=appendCommandAudit(restored,{transaction,action:direction,actor,at:eventDate(options)});
    const saved=await api.saveData(audited);
    if(saved?.ok===false)return {ok:false,error:saved.error||'数据保存失败',code:'PERSIST_FAILED'};
    const completed=direction==='undo'?history.completeUndo():history.completeRedo();
    store.replaceDatabase(audited,{source:direction,transactionId:transaction.id});
    const effectResults=await runEffects(api,audited,[{type:'syncPeopleAccounts'}]);
    notifyApplicationRuntime({type:'history-changed',action:direction,transaction:completed,database:audited});
    return {ok:true,database:audited,transaction:completed,effectResults,saved,history:history.status()};
  }

  const service={
    async load(){
      const database=normalizeDatabase(await api.loadData());
      history.clear();
      store.replaceDatabase(database,{source:'load'});
      notifyApplicationRuntime({type:'history-reset',action:'load',database});
      return store.getState();
    },
    async dispatch(command,options={}){
      const before=cloneDatabase(store.getDatabase());
      const result=executeResourceCommand(before,command,options);
      if(!result.ok)return result;
      const persisted=await persistTransaction({before,after:result.database,commands:[command],effects:result.effects,options,source:'command'});
      if(!persisted.ok)return persisted;
      return {...result,...persisted,database:persisted.database};
    },
    async dispatchMany(commands=[],options={}){
      if(!Array.isArray(commands)||!commands.length)return {ok:false,error:'没有可执行的批量命令',code:'COMMANDS_REQUIRED'};
      const before=cloneDatabase(store.getDatabase());
      let database=cloneDatabase(before);
      const results=[];
      const effects=[];
      for(let index=0;index<commands.length;index++){
        const result=executeResourceCommand(database,commands[index],options);
        if(!result.ok)return {...result,failedIndex:index,failedCommand:commands[index],results};
        database=result.database;
        results.push(result);
        effects.push(...(result.effects||[]));
      }
      const persisted=await persistTransaction({before,after:database,commands,effects,options,source:'commands',label:options.label||''});
      if(!persisted.ok)return {...persisted,results};
      return {...persisted,results};
    },
    async replaceDatabase(database,{syncAccounts=true,recordHistory=true,label='替换数据库',...options}={}){
      const before=cloneDatabase(store.getDatabase());
      const normalized=normalizeDatabase(database);
      if(!recordHistory){
        const saved=await api.saveData(normalized);
        if(saved?.ok===false)return {ok:false,error:saved.error||'数据保存失败',code:'PERSIST_FAILED'};
        history.clear();
        store.replaceDatabase(normalized,{source:'replace'});
        const effectResults=syncAccounts&&typeof api.syncPeopleAccounts==='function'
          ? [{type:'syncPeopleAccounts',result:await api.syncPeopleAccounts(normalized.people)}]
          : [];
        notifyApplicationRuntime({type:'history-reset',action:'replace',database:normalized});
        return {ok:true,database:normalized,effectResults,saved};
      }
      const effects=syncAccounts?[{type:'syncPeopleAccounts'}]:[];
      return persistTransaction({before,after:normalized,commands:[{type:'database.replace'}],effects,options,source:'replace',label});
    },
    undo(options={}){return restoreHistoryTransaction('undo',options);},
    redo(options={}){return restoreHistoryTransaction('redo',options);},
    historyStatus(){return history.status();},
    auditTrail({limit=100}={}){return commandAuditTrail(store.getDatabase(),{limit});},
    clearHistory(){
      history.clear();
      notifyApplicationRuntime({type:'history-reset',action:'clear'});
      return history.status();
    }
  };
  registerApplicationService(service);
  return service;
}
