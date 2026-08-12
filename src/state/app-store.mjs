import { emptyDatabase } from '../core.mjs';
import { cloneDatabase, normalizeDatabase } from '../schema/database.mjs';

export const APP_VIEWS=['dashboard','projects','people','schedule','import','settings'];
export const DEFAULT_FILTERS=Object.freeze({
  projects:'', projectStatus:'全部', projectStartFrom:'', projectStartTo:'',
  people:'', peopleDepartment:'全部', peoplePosition:'全部', peopleMetric:'all'
});

function initialState({ database=emptyDatabase(), user=null, view='dashboard', filters={} }={}) {
  return {
    database:normalizeDatabase(database),
    user:user || null,
    view:APP_VIEWS.includes(view)?view:'dashboard',
    filters:{...DEFAULT_FILTERS,...filters},
    revision:0
  };
}

export function createAppStore(options={}) {
  let state=initialState(options);
  const listeners=new Set();

  const notify=(meta={})=>{
    const event={ state, revision:state.revision, ...meta };
    for (const listener of listeners) listener(event);
  };

  const commit=(next,meta={})=>{
    state={...next,revision:state.revision+1};
    notify(meta);
    return state;
  };

  return {
    getState(){ return state; },
    getDatabase(){ return state.database; },
    snapshot(){
      return {
        ...state,
        database:cloneDatabase(state.database),
        filters:{...state.filters},
        user:state.user ? {...state.user} : null
      };
    },
    subscribe(listener){
      if (typeof listener !== 'function') throw new TypeError('listener 必须是函数');
      listeners.add(listener);
      return ()=>listeners.delete(listener);
    },
    setUser(user){ return commit({...state,user:user||null},{type:'user'}); },
    setView(view){
      if (!APP_VIEWS.includes(view)) throw new Error(`未知视图：${view}`);
      if (state.view===view) return state;
      return commit({...state,view},{type:'view',view});
    },
    setFilters(patch={}){
      const filters={...state.filters,...patch};
      return commit({...state,filters},{type:'filters',patch:{...patch}});
    },
    replaceDatabase(database,meta={}){
      return commit({...state,database:normalizeDatabase(database)},{type:'database:replace',...meta});
    },
    updateDatabase(mutator,meta={}){
      if (typeof mutator !== 'function') throw new TypeError('mutator 必须是函数');
      const draft=cloneDatabase(state.database);
      const result=mutator(draft);
      if (result?.ok===false) return result;
      const next=commit({...state,database:normalizeDatabase(draft)},{type:'database:update',...meta});
      return result ?? {ok:true,state:next};
    }
  };
}
