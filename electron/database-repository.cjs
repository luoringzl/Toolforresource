const crypto=require('crypto');
const fs=require('fs');
const path=require('path');

function timestamp(value=new Date()){
  const pad=number=>String(number).padStart(2,'0');
  return `${value.getFullYear()}${pad(value.getMonth()+1)}${pad(value.getDate())}-${pad(value.getHours())}${pad(value.getMinutes())}${pad(value.getSeconds())}-${String(value.getMilliseconds()).padStart(3,'0')}`;
}

function fileHash(filePath){
  if(!fs.existsSync(filePath))return '';
  const hash=crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function safeJsonRead(filePath){
  try{return {ok:true,data:JSON.parse(fs.readFileSync(filePath,'utf8'))};}
  catch(error){return {ok:false,error};}
}

function ensureDirectory(directory){fs.mkdirSync(directory,{recursive:true});}

function createDatabaseRepository({filePath,defaultsFactory,version,backupLimit=5,now=()=>new Date()}={}){
  if(!filePath)throw new Error('database repository 需要 filePath');
  if(typeof defaultsFactory!=='function')throw new Error('database repository 需要 defaultsFactory');
  const recoveryDirectory=`${filePath}.recovery`;

  function recoveryPoints(){
    if(!fs.existsSync(recoveryDirectory))return [];
    return fs.readdirSync(recoveryDirectory)
      .filter(name=>name.endsWith('.json'))
      .map(name=>{
        const fullPath=path.join(recoveryDirectory,name);
        const stat=fs.statSync(fullPath);
        const parsed=safeJsonRead(fullPath);
        return {name,path:fullPath,sizeBytes:stat.size,modifiedAt:stat.mtime.toISOString(),valid:parsed.ok,version:parsed.ok?Number(parsed.data?.version||0):0};
      })
      .sort((a,b)=>b.modifiedAt.localeCompare(a.modifiedAt));
  }

  function pruneRecoveryPoints(){
    const points=recoveryPoints();
    for(const point of points.slice(Math.max(0,Number(backupLimit||5)))){
      try{fs.unlinkSync(point.path);}catch{}
    }
  }

  function snapshotCurrent(){
    if(!fs.existsSync(filePath))return null;
    const parsed=safeJsonRead(filePath);
    if(!parsed.ok)return null;
    ensureDirectory(recoveryDirectory);
    const destination=path.join(recoveryDirectory,`database-${timestamp(now())}.json`);
    fs.copyFileSync(filePath,destination);
    pruneRecoveryPoints();
    return destination;
  }

  function quarantineBroken(error){
    if(!fs.existsSync(filePath))return '';
    const broken=`${filePath}.broken-${timestamp(now())}`;
    fs.copyFileSync(filePath,broken);
    return broken;
  }

  function load(){
    if(!fs.existsSync(filePath))return defaultsFactory();
    const parsed=safeJsonRead(filePath);
    if(parsed.ok)return {...defaultsFactory(),...parsed.data};
    const broken=quarantineBroken(parsed.error);
    return {...defaultsFactory(),recoveryWarning:`数据库读取失败，损坏文件已隔离为 ${broken}`};
  }

  function save(data,{createRecovery=true}={}){
    ensureDirectory(path.dirname(filePath));
    const previousHash=fileHash(filePath);
    const recoveryPath=createRecovery?snapshotCurrent():null;
    const next={...data,version,meta:{...(data?.meta||{}),schemaVersion:version},updatedAt:now().toISOString()};
    const temp=`${filePath}.tmp-${process.pid}-${Date.now()}`;
    try{
      fs.writeFileSync(temp,JSON.stringify(next,null,2),'utf8');
      const verify=safeJsonRead(temp);
      if(!verify.ok)throw verify.error;
      fs.renameSync(temp,filePath);
      const stat=fs.statSync(filePath);
      return {ok:true,updatedAt:next.updatedAt,sizeBytes:stat.size,sha256:fileHash(filePath),previousSha256:previousHash,recoveryPath};
    }catch(error){
      try{if(fs.existsSync(temp))fs.unlinkSync(temp);}catch{}
      return {ok:false,error:error.message,recoveryPath};
    }
  }

  function diagnostics(){
    const exists=fs.existsSync(filePath);
    const stat=exists?fs.statSync(filePath):null;
    const parsed=exists?safeJsonRead(filePath):{ok:true,data:null};
    const points=recoveryPoints();
    return {
      filePath,recoveryDirectory,exists,valid:parsed.ok,
      sizeBytes:stat?.size||0,modifiedAt:stat?.mtime?.toISOString?.()||'',
      version:parsed.ok?Number(parsed.data?.version||0):0,
      updatedAt:parsed.ok?String(parsed.data?.updatedAt||''):'',
      sha256:exists?fileHash(filePath):'',
      recoveryCount:points.length,recoveryPoints:points,
      error:parsed.ok?'':parsed.error?.message||'数据库读取失败'
    };
  }

  function restoreRecoveryPoint(name){
    const points=recoveryPoints();
    const point=points.find(item=>item.name===name);
    if(!point)return {ok:false,error:'恢复点不存在'};
    if(!point.valid)return {ok:false,error:'恢复点数据损坏'};
    const parsed=safeJsonRead(point.path);
    if(!parsed.ok)return {ok:false,error:parsed.error.message};
    const currentRecovery=snapshotCurrent();
    const result=save(parsed.data,{createRecovery:false});
    return {...result,restoredFrom:point.name,currentRecovery};
  }

  function clearRecoveryPoints(){
    const points=recoveryPoints();
    let removed=0;
    for(const point of points){try{fs.unlinkSync(point.path);removed+=1;}catch{}}
    return {ok:true,removed};
  }

  return {load,save,diagnostics,recoveryPoints,restoreRecoveryPoint,clearRecoveryPoints,snapshotCurrent};
}

module.exports={createDatabaseRepository,fileHash,safeJsonRead};
