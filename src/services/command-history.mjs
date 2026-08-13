import { cloneDatabase } from '../schema/database.mjs';

const COMMAND_LABELS=Object.freeze({
  'project.upsert':'保存项目','project.delete':'删除项目',
  'person.upsert':'保存人员','person.delete':'删除人员',
  'assignment.assign':'安排项目分工','assignment.remove':'移除项目分工','assignment.status':'更新分工状态',
  'need.upsert':'保存用人需求','need.delete':'删除用人需求',
  'database.replace':'替换数据库'
});

function defaultId(){
  return `tx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;
}

function commandsLabel(commands=[]){
  if(commands.length===1)return COMMAND_LABELS[commands[0]?.type]||commands[0]?.type||'数据变更';
  const names=[...new Set(commands.map(command=>COMMAND_LABELS[command?.type]||command?.type||'数据变更'))];
  return names.length<=2?names.join(' + '):`${names.slice(0,2).join(' + ')} 等 ${commands.length} 条`;
}

function transactionSummary(transaction){
  if(!transaction)return null;
  return {
    id:transaction.id,label:transaction.label,source:transaction.source,createdAt:transaction.createdAt,
    actor:transaction.actor,commandTypes:[...transaction.commandTypes],commandCount:transaction.commandCount
  };
}

export function createCommandHistory({limit=50,idFactory=defaultId,now=()=>new Date()}={}){
  const undoStack=[];
  const redoStack=[];
  const max=Math.max(1,Number(limit||50));

  function createTransaction({before,after,commands=[],actor=null,label='',source='command'}={}){
    const types=commands.map(command=>command?.type||'unknown');
    return {
      id:idFactory(),label:label||commandsLabel(commands),source,createdAt:now().toISOString(),actor:actor?{...actor}:null,
      commandTypes:types,commandCount:commands.length,
      before:cloneDatabase(before),after:cloneDatabase(after)
    };
  }

  function commit(transaction){
    undoStack.push(transaction);
    while(undoStack.length>max)undoStack.shift();
    redoStack.length=0;
    return transactionSummary(transaction);
  }

  function peekUndo(){return undoStack.at(-1)||null;}
  function completeUndo(){
    const transaction=undoStack.pop();
    if(transaction)redoStack.push(transaction);
    return transactionSummary(transaction);
  }
  function peekRedo(){return redoStack.at(-1)||null;}
  function completeRedo(){
    const transaction=redoStack.pop();
    if(transaction){undoStack.push(transaction);while(undoStack.length>max)undoStack.shift();}
    return transactionSummary(transaction);
  }
  function clear(){undoStack.length=0;redoStack.length=0;}
  function status(){
    return {
      canUndo:Boolean(undoStack.length),canRedo:Boolean(redoStack.length),undoCount:undoStack.length,redoCount:redoStack.length,
      nextUndo:transactionSummary(peekUndo()),nextRedo:transactionSummary(peekRedo())
    };
  }
  return {createTransaction,commit,peekUndo,completeUndo,peekRedo,completeRedo,clear,status};
}

export function appendCommandAudit(database,{transaction,action='commit',actor=null,at=new Date(),text='',limit=1000}={}){
  const db=cloneDatabase(database);
  db.activity=Array.isArray(db.activity)?db.activity:[];
  const auditActor=actor||transaction?.actor||null;
  const label=transaction?.label||'数据变更';
  const actionLabel={commit:'执行',undo:'撤销',redo:'重做',replace:'替换'}[action]||action;
  const date=at instanceof Date?at:new Date(at);
  const createdAt=Number.isFinite(date.getTime())?date.toISOString():new Date().toISOString();
  db.activity.unshift({
    id:`audit-${transaction?.id||Date.now()}-${action}-${createdAt.replace(/\D/g,'')}`,
    type:'command-audit',action,transactionId:transaction?.id||'',
    label,text:text||`${actionLabel}：${label}`,
    actorId:auditActor?.id||'',actor:auditActor?.displayName||auditActor?.username||'',
    source:transaction?.source||'',commandTypes:[...(transaction?.commandTypes||[])],commandCount:Number(transaction?.commandCount||0),
    createdAt
  });
  db.activity=db.activity.slice(0,Math.max(1,Number(limit||1000)));
  return db;
}

export function restoreSnapshotPreservingAudit(snapshot,currentDatabase){
  const restored=cloneDatabase(snapshot);
  restored.activity=cloneDatabase(currentDatabase).activity||[];
  return restored;
}

export function commandAuditTrail(database,{limit=100}={}){
  return (database?.activity||[]).filter(item=>item?.type==='command-audit').slice(0,Math.max(0,Number(limit||100))).map(item=>({...item,commandTypes:[...(item.commandTypes||[])]}));
}
