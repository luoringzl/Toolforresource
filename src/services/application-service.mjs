import { executeResourceCommand } from './resource-commands.mjs';
import { normalizeDatabase } from '../schema/database.mjs';

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

export function createApplicationService({api,store}){
  if(!api)throw new Error('Application Service 需要 platform api');
  if(!store)throw new Error('Application Service 需要 app store');

  return {
    async load(){
      const database=normalizeDatabase(await api.loadData());
      store.replaceDatabase(database,{source:'load'});
      return store.getState();
    },
    async dispatch(command,options={}){
      const result=executeResourceCommand(store.getDatabase(),command,options);
      if(!result.ok)return result;
      const saved=await api.saveData(result.database);
      if(saved?.ok===false)return {ok:false,error:saved.error||'数据保存失败',code:'PERSIST_FAILED'};
      store.replaceDatabase(result.database,{source:'command',command:command.type});
      const effectResults=await runEffects(api,result.database,result.effects);
      return {...result,effectResults};
    },
    async dispatchMany(commands=[],options={}){
      if(!Array.isArray(commands)||!commands.length)return {ok:false,error:'没有可执行的批量命令',code:'COMMANDS_REQUIRED'};
      let database=store.getDatabase();
      const results=[];
      const effects=[];
      for(let index=0;index<commands.length;index++){
        const result=executeResourceCommand(database,commands[index],options);
        if(!result.ok)return {...result,failedIndex:index,failedCommand:commands[index],results};
        database=result.database;
        results.push(result);
        effects.push(...(result.effects||[]));
      }
      const saved=await api.saveData(database);
      if(saved?.ok===false)return {ok:false,error:saved.error||'数据保存失败',code:'PERSIST_FAILED',results};
      store.replaceDatabase(database,{source:'commands',commands:commands.map(command=>command.type)});
      const effectResults=await runEffects(api,database,effects);
      return {ok:true,database,results,effectResults,saved};
    },
    async replaceDatabase(database,{syncAccounts=true}={}){
      const normalized=normalizeDatabase(database);
      const saved=await api.saveData(normalized);
      if(saved?.ok===false)return {ok:false,error:saved.error||'数据保存失败',code:'PERSIST_FAILED'};
      store.replaceDatabase(normalized,{source:'replace'});
      const effectResults=syncAccounts&&typeof api.syncPeopleAccounts==='function'
        ? [{type:'syncPeopleAccounts',result:await api.syncPeopleAccounts(normalized.people)}]
        : [];
      return {ok:true,database:normalized,effectResults};
    }
  };
}
