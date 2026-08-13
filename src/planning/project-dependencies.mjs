import { cloneDatabase } from '../schema/database.mjs';
import { localDateKey } from '../utils/date.mjs';
import {
  addWorkingDaysKey,
  countWorkingDates,
  nextWorkingDate,
  parseCalendarDate,
  workCalendarFromDatabase
} from './work-calendar.mjs';

const DEPENDENCY_TYPES=Object.freeze(['FS','SS','FF','SF']);
const TYPE_ALIASES=Object.freeze({
  FS:'FS','finish-to-start':'FS','finish_to_start':'FS','完成后开始':'FS',
  SS:'SS','start-to-start':'SS','start_to_start':'SS','开始后开始':'SS',
  FF:'FF','finish-to-finish':'FF','finish_to_finish':'FF','完成后完成':'FF',
  SF:'SF','start-to-finish':'SF','start_to_finish':'SF','开始后完成':'SF'
});

function dependencyType(value='FS'){
  return TYPE_ALIASES[String(value||'FS')]||String(value||'FS').toUpperCase();
}

function clampLag(value){
  const number=Number(value||0);
  return Number.isFinite(number)?Math.max(-3650,Math.min(3650,Math.round(number))):0;
}

export function normalizeProjectDependencies(project={}){
  const result=[];
  const seen=new Set();
  for(const item of Array.isArray(project.dependencies)?project.dependencies:[]){
    const predecessorId=String(item?.predecessorId||item?.projectId||'').trim();
    if(!predecessorId)continue;
    const type=dependencyType(item?.type||'FS');
    if(!DEPENDENCY_TYPES.includes(type))continue;
    const lagDays=clampLag(item?.lagDays??item?.lag??0);
    const key=`${predecessorId}:${type}:${lagDays}`;
    if(seen.has(key))continue;
    seen.add(key);
    result.push({predecessorId,type,lagDays,note:String(item?.note||'').trim()});
  }
  return result;
}

export function normalizeProjectMilestones(project={}){
  const custom=(Array.isArray(project.milestones)?project.milestones:[]).map((item,index)=>({
    id:String(item?.id||`custom-${index+1}`),label:String(item?.label||'里程碑').trim()||'里程碑',
    date:String(item?.date||''),type:String(item?.type||'custom'),status:String(item?.status||''),source:'custom'
  })).filter(item=>parseCalendarDate(item.date));
  const builtIn=[
    ['asset',project.assetCompletionDate,'资产完成'],
    ['video',project.videoCompletionDate,'视频完成'],
    ['ddl',project.ddl,'DDL']
  ].filter(([,date])=>parseCalendarDate(date)).map(([type,date,label])=>({id:`builtin-${type}`,label,date,type,status:'',source:'builtin'}));
  return [...builtIn,...custom].sort((a,b)=>a.date.localeCompare(b.date)||a.label.localeCompare(b.label,'zh-CN'));
}

function graphData(db){
  const projects=db.projects||[];
  const byId=new Map(projects.map(project=>[project.id,project]));
  const edges=[];
  for(const project of projects){
    for(const dependency of normalizeProjectDependencies(project)){
      edges.push({from:dependency.predecessorId,to:project.id,...dependency});
    }
  }
  return {projects,byId,edges};
}

function findCyclePaths(projectIds,edges){
  const adjacency=new Map(projectIds.map(id=>[id,[]]));
  for(const edge of edges){if(adjacency.has(edge.from)&&adjacency.has(edge.to))adjacency.get(edge.from).push(edge.to);}
  const color=new Map(projectIds.map(id=>[id,0]));
  const stack=[];
  const cycles=[];
  const seen=new Set();
  function visit(id){
    color.set(id,1);stack.push(id);
    for(const next of adjacency.get(id)||[]){
      if(color.get(next)===0)visit(next);
      else if(color.get(next)===1){
        const start=stack.lastIndexOf(next);
        const cycle=[...stack.slice(start),next];
        const canonical=[...cycle.slice(0,-1)].sort().join('|');
        if(!seen.has(canonical)){seen.add(canonical);cycles.push(cycle);}
      }
    }
    stack.pop();color.set(id,2);
  }
  for(const id of projectIds){if(color.get(id)===0)visit(id);}
  return cycles;
}

export function validateProjectDependencyGraph(db){
  const {projects,byId,edges}=graphData(db);
  const errors=[];
  for(const edge of edges){
    if(!byId.has(edge.from))errors.push({code:'DEPENDENCY_PREDECESSOR_NOT_FOUND',projectId:edge.to,predecessorId:edge.from,message:'前置项目不存在'});
    if(edge.from===edge.to)errors.push({code:'DEPENDENCY_SELF_REFERENCE',projectId:edge.to,predecessorId:edge.from,message:'项目不能依赖自身'});
  }
  const validEdges=edges.filter(edge=>byId.has(edge.from)&&byId.has(edge.to)&&edge.from!==edge.to);
  const ids=projects.map(project=>project.id);
  const indegree=new Map(ids.map(id=>[id,0]));
  const adjacency=new Map(ids.map(id=>[id,[]]));
  for(const edge of validEdges){adjacency.get(edge.from).push(edge);indegree.set(edge.to,(indegree.get(edge.to)||0)+1);}
  const queue=ids.filter(id=>(indegree.get(id)||0)===0).sort();
  const order=[];
  while(queue.length){
    const id=queue.shift();order.push(id);
    for(const edge of adjacency.get(id)||[]){
      const next=edge.to;indegree.set(next,indegree.get(next)-1);
      if(indegree.get(next)===0){queue.push(next);queue.sort();}
    }
  }
  const cycles=order.length===ids.length?[]:findCyclePaths(ids,validEdges);
  for(const cycle of cycles)errors.push({code:'DEPENDENCY_CYCLE',projectIds:cycle,message:`项目依赖形成循环：${cycle.join(' → ')}`});
  return {ok:errors.length===0,errors,cycles,order:errors.some(error=>error.code==='DEPENDENCY_CYCLE')?[]:order,edges:validEdges};
}

function projectDuration(project,calendar){
  const explicit=Number(project.plannedDurationDays||0);
  if(Number.isFinite(explicit)&&explicit>0)return Math.max(1,Math.round(explicit));
  if(parseCalendarDate(project.startDate)&&parseCalendarDate(project.ddl))return Math.max(1,countWorkingDates(project.startDate,project.ddl,calendar));
  return 1;
}

function offsetFromDate(origin,date,calendar){
  if(!parseCalendarDate(date))return 0;
  const target=nextWorkingDate(date,calendar);
  if(!target||target<=origin)return 0;
  return Math.max(0,countWorkingDates(origin,target,calendar)-1);
}

function dateFromOffset(origin,offset,calendar){
  return addWorkingDaysKey(origin,Math.max(0,Math.round(offset||0)),calendar);
}

function forwardConstraint(predecessor,dependency,duration){
  const lag=dependency.lagDays;
  if(dependency.type==='SS')return predecessor.earliestStartOffset+lag;
  if(dependency.type==='FF')return predecessor.earliestFinishOffset+lag-duration;
  if(dependency.type==='SF')return predecessor.earliestStartOffset+lag-duration;
  return predecessor.earliestFinishOffset+lag;
}

function backwardFinishConstraint(current,successor,dependency){
  const lag=dependency.lagDays;
  if(dependency.type==='SS')return successor.latestStartOffset-lag+current.durationDays;
  if(dependency.type==='FF')return successor.latestFinishOffset-lag;
  if(dependency.type==='SF')return successor.latestFinishOffset-lag+current.durationDays;
  return successor.latestStartOffset-lag;
}

function deadlineLateDays(plannedFinish,ddl,calendar){
  if(!parseCalendarDate(plannedFinish)||!parseCalendarDate(ddl)||plannedFinish<=ddl)return 0;
  const firstLate=addWorkingDaysKey(ddl,1,calendar);
  return firstLate?countWorkingDates(firstLate,plannedFinish,calendar):0;
}

export function calculateProjectCriticalPath(db,{startDate=''}={}){
  const validation=validateProjectDependencyGraph(db);
  if(!validation.ok)return {ok:false,...validation,nodes:[],criticalPathIds:[]};
  const {projects,byId,edges}=graphData(db);
  if(!projects.length)return {ok:true,...validation,nodes:[],criticalPathIds:[],networkStartDate:'',networkFinishDate:'',networkDurationDays:0};
  const calendar=workCalendarFromDatabase(db);
  const projectStarts=projects.map(project=>project.startDate).filter(parseCalendarDate).sort();
  const requested=startDate||projectStarts[0]||localDateKey(new Date());
  const origin=nextWorkingDate(requested,calendar)||requested;
  const incoming=new Map(projects.map(project=>[project.id,[]]));
  const outgoing=new Map(projects.map(project=>[project.id,[]]));
  for(const edge of edges){incoming.get(edge.to).push(edge);outgoing.get(edge.from).push(edge);}
  const nodes=new Map();

  for(const id of validation.order){
    const project=byId.get(id);
    const durationDays=projectDuration(project,calendar);
    let earliestStartOffset=offsetFromDate(origin,project.startDate,calendar);
    let driverPredecessorId='';
    let driverConstraint=earliestStartOffset;
    for(const dependency of incoming.get(id)||[]){
      const predecessor=nodes.get(dependency.from);
      const candidate=Math.max(0,forwardConstraint(predecessor,dependency,durationDays));
      if(candidate>driverConstraint){driverConstraint=candidate;driverPredecessorId=dependency.from;}
      earliestStartOffset=Math.max(earliestStartOffset,candidate);
    }
    const earliestFinishOffset=earliestStartOffset+durationDays;
    nodes.set(id,{project,durationDays,earliestStartOffset,earliestFinishOffset,driverPredecessorId});
  }

  const networkFinishOffset=Math.max(...[...nodes.values()].map(node=>node.earliestFinishOffset));
  for(const id of [...validation.order].reverse()){
    const node=nodes.get(id);
    const successors=outgoing.get(id)||[];
    let latestFinishOffset=networkFinishOffset;
    if(successors.length){
      latestFinishOffset=Math.min(...successors.map(dependency=>{
        const successor=nodes.get(dependency.to);
        return backwardFinishConstraint(node,successor,dependency);
      }));
    }
    node.latestFinishOffset=latestFinishOffset;
    node.latestStartOffset=latestFinishOffset-node.durationDays;
    node.totalFloatDays=node.latestStartOffset-node.earliestStartOffset;
    node.critical=node.totalFloatDays<=0;
  }

  const terminal=[...nodes.values()].filter(node=>node.earliestFinishOffset===networkFinishOffset).sort((a,b)=>a.totalFloatDays-b.totalFloatDays)[0];
  const criticalPathIds=[];
  let cursor=terminal;
  while(cursor){
    criticalPathIds.unshift(cursor.project.id);
    cursor=cursor.driverPredecessorId?nodes.get(cursor.driverPredecessorId):null;
  }

  const output=validation.order.map(id=>{
    const node=nodes.get(id);
    const plannedStartDate=dateFromOffset(origin,node.earliestStartOffset,calendar);
    const plannedFinishDate=dateFromOffset(origin,node.earliestFinishOffset-1,calendar);
    const latestStartDate=dateFromOffset(origin,Math.max(0,node.latestStartOffset),calendar);
    const latestFinishDate=dateFromOffset(origin,Math.max(0,node.latestFinishOffset-1),calendar);
    return {
      project:node.project,durationDays:node.durationDays,
      plannedStartDate,plannedFinishDate,latestStartDate,latestFinishDate,
      earliestStartOffset:node.earliestStartOffset,earliestFinishOffset:node.earliestFinishOffset,
      latestStartOffset:node.latestStartOffset,latestFinishOffset:node.latestFinishOffset,
      totalFloatDays:node.totalFloatDays,critical:node.critical,driverPredecessorId:node.driverPredecessorId,
      lateByWorkingDays:deadlineLateDays(plannedFinishDate,node.project.ddl,calendar),
      dependencies:normalizeProjectDependencies(node.project),milestones:normalizeProjectMilestones(node.project)
    };
  });
  return {
    ok:true,...validation,nodes:output,criticalPathIds,
    networkStartDate:origin,
    networkFinishDate:dateFromOffset(origin,networkFinishOffset-1,calendar),
    networkDurationDays:networkFinishOffset,
    criticalProjects:output.filter(node=>node.critical).map(node=>node.project.id),
    deadlineRisks:output.filter(node=>node.lateByWorkingDays>0)
  };
}

export function dependencyReadiness(db,projectId){
  const project=(db.projects||[]).find(item=>item.id===projectId);
  if(!project)return {ok:false,error:'项目不存在',ready:false,dependencies:[]};
  const completed=new Set(['已完成','已完结','已取消']);
  const startedStatus=status=>status&&!['待启动',''].includes(status);
  const dependencies=normalizeProjectDependencies(project).map(dependency=>{
    const predecessor=(db.projects||[]).find(item=>item.id===dependency.predecessorId);
    let satisfied=false;
    if(predecessor){
      if(['SS','SF'].includes(dependency.type))satisfied=startedStatus(predecessor.status);
      else satisfied=completed.has(predecessor.status);
    }
    return {...dependency,predecessor,satisfied};
  });
  return {ok:true,project,ready:dependencies.every(item=>item.satisfied),dependencies,blockers:dependencies.filter(item=>!item.satisfied)};
}

export function addProjectDependency(db,{projectId,predecessorId,type='FS',lagDays=0,note=''}={}){
  const next=cloneDatabase(db);
  const project=next.projects.find(item=>item.id===projectId);
  const predecessor=next.projects.find(item=>item.id===predecessorId);
  if(!project)return {ok:false,error:'项目不存在',database:db};
  if(!predecessor)return {ok:false,error:'前置项目不存在',database:db};
  if(projectId===predecessorId)return {ok:false,error:'项目不能依赖自身',database:db};
  project.dependencies=normalizeProjectDependencies({...project,dependencies:[...(project.dependencies||[]),{predecessorId,type,lagDays,note}]});
  const validation=validateProjectDependencyGraph(next);
  if(!validation.ok)return {ok:false,error:validation.errors[0]?.message||'项目依赖无效',code:validation.errors[0]?.code,database:db,validation};
  return {ok:true,database:next,project,dependency:project.dependencies.at(-1),validation};
}

export function removeProjectDependency(db,{projectId,predecessorId,type}={}){
  const next=cloneDatabase(db);
  const project=next.projects.find(item=>item.id===projectId);
  if(!project)return {ok:false,error:'项目不存在',database:db};
  const targetType=type?dependencyType(type):'';
  project.dependencies=normalizeProjectDependencies(project).filter(item=>!(item.predecessorId===predecessorId&&(!targetType||item.type===targetType)));
  return {ok:true,database:next,project};
}

export function upsertProjectMilestone(db,{projectId,id='',label,date,type='custom',status=''}={}){
  const next=cloneDatabase(db);
  const project=next.projects.find(item=>item.id===projectId);
  if(!project)return {ok:false,error:'项目不存在',database:db};
  if(!String(label||'').trim())return {ok:false,error:'里程碑名称不能为空',database:db};
  if(!parseCalendarDate(date))return {ok:false,error:'里程碑日期无效',database:db};
  const milestones=Array.isArray(project.milestones)?[...project.milestones]:[];
  const milestoneId=id||`milestone-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;
  const index=milestones.findIndex(item=>item.id===milestoneId);
  const value={id:milestoneId,label:String(label).trim(),date,type,status};
  if(index>=0)milestones[index]=value;else milestones.push(value);
  project.milestones=milestones;
  return {ok:true,database:next,project,milestone:value};
}
