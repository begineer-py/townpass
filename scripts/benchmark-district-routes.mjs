// Run the actual local plan-places worker on frozen source/data and one live
// construction snapshot. This is not the online official routing flow.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fork,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath,pathToFileURL} from 'node:url';

const script=fileURLToPath(import.meta.url),here=path.dirname(script);
const project=path.resolve(here,'..');
const sha=x=>createHash('sha256').update(x).digest('hex');
const fileHash=p=>sha(fs.readFileSync(p));
function treeHash(dir){const rows=[];function visit(d){for(const e of fs.readdirSync(d,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const p=path.join(d,e.name);if(e.isDirectory())visit(p);else if(e.isFile())rows.push(`${path.relative(dir,p).replaceAll('\\','/')} ${fileHash(p)}`);}}visit(dir);return sha(rows.join('\n'));}
const readJSON=p=>JSON.parse(fs.readFileSync(p));
const readGz=p=>JSON.parse(gunzipSync(fs.readFileSync(p)));
const saveAtomic=(p,data)=>{const t=p+'.next';fs.writeFileSync(t,JSON.stringify(data,null,2)+'\n');fs.renameSync(t,p);};
const options={avoidSteps:true,minWidth:.8,maxSlope:8,knownOnly:false,officialOnly:false,preferOfficial:true,mode:'balanced'};
const timeoutMs=30000;
const names=['graph','facilities','places','official-conditions','sidewalks'];

if(process.argv[2]==='--worker'){
 const run=process.argv[3],frozen=path.join(run,'frozen'),data=path.join(frozen,'data');
 const lists=['facilities','places'].flatMap(n=>readGz(path.join(data,`${n}.json.gz`)));
 const byId=new Map(lists.map(p=>[p.id,p]));
 globalThis.self={};
 globalThis.fetch=async url=>{
  const name=path.posix.basename(new URL(String(url)).pathname);
  if(!names.some(n=>name===`${n}.json.gz`))throw Error(`Unexpected request ${name}`);
  const buf=fs.readFileSync(path.join(data,name));
  return {ok:true,arrayBuffer:async()=>buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength)};
 };
 globalThis.postMessage=message=>{
  if(message.type==='ready'){process.send({type:'ready'});return;}
  if(message.type==='error'){process.send({type:'error',id:message.id,error:String(message.message||message.error||'WORKER_ERROR')});return;}
  if(message.type!=='route')return;
  const r=message.result||{},selected=r.routeCandidates?.candidates?.find(c=>c.id===r.selectedCandidateId);
  const segments=r.tierSegments||[];
  const details={error:r.error??null,distance:r.distance??null,provider:r.provider??null,geometryVerification:r.geometryVerification??null,
   policyVersion:r.policyVersion??null,weightedCost:r.weightedCost??null,conditionDetourLimit:r.conditionDetourLimit??null,
   resolvedStart:r.resolvedStart?{id:r.resolvedStart.id,lat:r.resolvedStart.lat,lon:r.resolvedStart.lon}:null,
   resolvedEnd:r.resolvedEnd?{id:r.resolvedEnd.id,lat:r.resolvedEnd.lat,lon:r.resolvedEnd.lon}:null,
   routeHash:r.coordinates?sha(JSON.stringify(r.coordinates)):null,
   candidateCount:r.routeCandidates?.candidates?.length??0,candidateStatus:r.routeCandidates?.status??null,
   selectedCandidateId:r.selectedCandidateId??null,score:selected?.score??null,scoreBreakdown:selected?.scoreBreakdown??null,metrics:selected?.metrics??null,
   sidewalkMetres:segments.filter(s=>s.explicitSidewalk===true).reduce((n,s)=>n+(s.distance||0),0),
   officialCoverageMetres:segments.filter(s=>s.tier==='official').reduce((n,s)=>n+(s.distance||0),0),
   sharedMetres:segments.filter(s=>s.sharedRoad===true).reduce((n,s)=>n+(s.distance||0),0),
   officialConditionsStatus:r.officialConditions?.status??null,officialConditionsCount:r.officialConditions?.points?.length??null,
   constructionBlocked:r.construction?.blocked?.length??null,approaches:r.approaches?.map(a=>({side:a.side,estimated:a.estimated,unconfirmed:a.unconfirmed,distance:a.distance}))??[],
   improvementStatus:r.pedestrianImprovement?.status??null,attemptErrors:r.attemptErrors??null,
   hasPartialRoute:!!r.partialRoute,routeGap:r.routeGap??null};
  process.send({type:'result',id:message.id,result:details});
 };
 await import(pathToFileURL(path.join(frozen,'src/route-worker.js')).href);
 await self.onmessage({data:{type:'init',url:'https://local.test/graph.json.gz'}});
 process.on('message',async m=>{
  if(m.type!=='run')return;
  const a=byId.get(m.pair.startId),b=byId.get(m.pair.endId);
  if(!a||!b){process.send({type:'result',id:m.id,result:{error:'MISSING_ENDPOINT'}});return;}
  await self.onmessage({data:{type:'plan-places',id:m.id,startPlace:a,endPlace:b,options,construction:m.snapshot}});
 });
}else if(process.argv[2]==='--start'||process.argv[2]==='--resume'){
 let run,meta,snapshot,sample;
 if(process.argv[2]==='--start'){
  sample=readJSON(process.env.DISTRICT_SAMPLE_FILE||path.join(project,'reports/district-route-sample-20261108.json'));
  for(const n of ['facilities','places'])if(fileHash(path.join(project,'public/data',`${n}.json.gz`))!==sample.inputHashes[n])throw Error(`Sampling data ${n} changed; rebuild and review sample`);
  run=fs.mkdtempSync(path.join(os.tmpdir(),'townpass-district-run-'));
  const frozen=path.join(run,'frozen');fs.mkdirSync(frozen);
  const sourceBefore=treeHash(path.join(project,'src'));
  const dataBefore=Object.fromEntries(names.map(n=>[n,fileHash(path.join(project,'public/data',`${n}.json.gz`))]));
  fs.cpSync(path.join(project,'src'),path.join(frozen,'src'),{recursive:true});fs.copyFileSync(path.join(project,'package.json'),path.join(frozen,'package.json'));
  if(treeHash(path.join(frozen,'src'))!==sourceBefore||treeHash(path.join(project,'src'))!==sourceBefore)throw Error('Source changed during copy; refusing mixed version');
  fs.symlinkSync(fs.realpathSync(path.join(project,'node_modules')),path.join(frozen,'node_modules'),process.platform==='win32'?'junction':'dir');
  fs.mkdirSync(path.join(frozen,'data'));
  for(const n of names)fs.copyFileSync(path.join(project,'public/data',`${n}.json.gz`),path.join(frozen,'data',`${n}.json.gz`));
  for(const n of names)if(fileHash(path.join(frozen,'data',`${n}.json.gz`))!==dataBefore[n]||fileHash(path.join(project,'public/data',`${n}.json.gz`))!==dataBefore[n])throw Error(`Data changed during copy: ${n}`);
  const {endpointLineProximity}=await import(pathToFileURL(path.join(here,'district-endpoint-proximity.mjs')).href);
  const records=['facilities','places'].flatMap(n=>readGz(path.join(frozen,'data',`${n}.json.gz`))),byId=new Map(records.map(p=>[p.id,p]));
  const ids=[...new Set(sample.samples.flatMap(p=>[p.startId,p.endId]))],sourceLines=readGz(path.join(frozen,'data/sidewalks.json.gz'));
  const endpoints=endpointLineProximity(sourceLines,ids.map(id=>byId.get(id)),10);
  fs.writeFileSync(path.join(run,'endpoint-proximity.json'),JSON.stringify({method:'Nearest bundled official line within 10m in planar approximation; geometric proximity only, not connectivity, safe crossing or accessibility.',radiusMetres:10,sourceLines:sourceLines.lines.length,sourceFetchedAt:sourceLines.fetchedAt,endpoints}));
  const shadow=path.join(project,'reports/official-sidewalk-shadow-graph.json');let shadowReport=null;
  if(fs.existsSync(shadow)){
   const before=fileHash(shadow),target=path.join(run,'shadow-summary.json');fs.copyFileSync(shadow,target);
   if(fileHash(target)!==before||fileHash(shadow)!==before)throw Error('Shadow report changed during copy');
   const report=readJSON(target);shadowReport={sha256:before,graphSha256:report.graphSha256??null,sourceSha256:report.sourceSha256??null,graphMatches:fileHash(path.join(frozen,'data/graph.json.gz'))===report.graphSha256,method:report.method,limitations:report.limitations};
  }
  const {normalizeConstruction,constructionFresh}=await import(pathToFileURL(path.join(frozen,'src/construction.mjs')).href);
  const response=await fetch('https://tpnco.blob.core.windows.net/blobfs/Todaywork.json',{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error(`Construction HTTP ${response.status}`);
  snapshot=normalizeConstruction(await response.json(),response.headers.get('last-modified'));
  if(!constructionFresh(snapshot))throw Error('Stale construction snapshot');
  fs.writeFileSync(path.join(run,'sample.json'),JSON.stringify(sample));fs.writeFileSync(path.join(run,'snapshot.json'),JSON.stringify(snapshot));
  const commit=spawnSync('git',['-C',project,'rev-parse','HEAD'],{encoding:'utf8'});
  meta={method:'Actual frozen local plan-places worker, not the online official routing flow. Public endpoints assigned by explicit Taipei district address, no route prefilter; fixed 30s per case.',seed:sample.seed,sourceCommit:commit.status===0?commit.stdout.trim():null,
   sourceTreeSha256:treeHash(path.join(frozen,'src')),scriptSha256:fileHash(script),sampleSha256:fileHash(path.join(run,'sample.json')),
   endpointProximityScriptSha256:fileHash(path.join(here,'district-endpoint-proximity.mjs')),endpointProximitySha256:fileHash(path.join(run,'endpoint-proximity.json')),shadowReport,
   packageSha256:fileHash(path.join(frozen,'package.json')),dependencyLockSha256:fileHash(path.join(project,'package-lock.json')),
   installedLockSha256:fs.existsSync(path.join(frozen,'node_modules/.package-lock.json'))?fileHash(path.join(frozen,'node_modules/.package-lock.json')):null,nodeVersion:process.version,
   dataSha256:Object.fromEntries(names.map(n=>[n,fileHash(path.join(frozen,'data',`${n}.json.gz`))])),
   snapshotSha256:fileHash(path.join(run,'snapshot.json')),fetchedAt:snapshot.fetchedAt,sourceUpdatedAt:snapshot.sourceUpdatedAt,workCount:snapshot.works.length,
   sampleCount:sample.samples.length,options,timeoutMs,results:[]};
  saveAtomic(path.join(run,'results.json'),meta);
 }else{
  run=path.resolve(process.argv[3]||'');if(!fs.existsSync(path.join(run,'results.json')))throw Error('Missing run directory');
  meta=readJSON(path.join(run,'results.json'));sample=readJSON(path.join(run,'sample.json'));snapshot=readJSON(path.join(run,'snapshot.json'));
 }
 const frozen=path.join(run,'frozen');
 if(fileHash(script)!==meta.scriptSha256||treeHash(path.join(frozen,'src'))!==meta.sourceTreeSha256||fileHash(path.join(run,'sample.json'))!==meta.sampleSha256||fileHash(path.join(run,'snapshot.json'))!==meta.snapshotSha256)throw Error('Run source, script, sample or snapshot changed; refusing to mix results');
 if(fileHash(path.join(here,'district-endpoint-proximity.mjs'))!==meta.endpointProximityScriptSha256||fileHash(path.join(run,'endpoint-proximity.json'))!==meta.endpointProximitySha256||(meta.shadowReport&&fileHash(path.join(run,'shadow-summary.json'))!==meta.shadowReport.sha256))throw Error('Endpoint or shadow audit changed; refusing to mix results');
 if(fileHash(path.join(frozen,'package.json'))!==meta.packageSha256||fileHash(path.join(project,'package-lock.json'))!==meta.dependencyLockSha256||process.version!==meta.nodeVersion)throw Error('Package lock or Node version changed; refusing to mix results');
 if(meta.installedLockSha256&&fileHash(path.join(frozen,'node_modules/.package-lock.json'))!==meta.installedLockSha256)throw Error('Installed dependencies changed; refusing to mix results');
 for(const n of names)if(fileHash(path.join(frozen,'data',`${n}.json.gz`))!==meta.dataSha256[n])throw Error(`Frozen data changed: ${n}`);
 const {constructionFresh}=await import(pathToFileURL(path.join(frozen,'src/construction.mjs')).href);
 console.log(`Run: ${run}\nSource ${meta.sourceTreeSha256}\nSnapshot ${meta.snapshotSha256}; ${meta.fetchedAt} / ${meta.sourceUpdatedAt}\nSample ${meta.sampleCount}`);
 let worker=null;
 const stop=()=>{worker?.kill();saveAtomic(path.join(run,'results.json'),meta);};
 process.on('SIGINT',()=>{stop();process.exit(130);});
 async function startWorker(){
  worker=fork(script,['--worker',run],{cwd:frozen,stdio:['ignore','ignore','inherit','ipc']});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Worker init timeout')),60000);worker.once('message',m=>{clearTimeout(timer);m.type==='ready'?resolve():reject(Error(JSON.stringify(m)));});worker.once('exit',code=>{clearTimeout(timer);reject(Error(`Worker init exited ${code}`));});});
 }
 async function one(pair,id){
  if(!worker)await startWorker();
  return await new Promise((resolve,reject)=>{
   const current=worker;
   const cleanup=()=>{clearTimeout(timer);current.off('message',onMessage);current.off('exit',onExit);};
   const onMessage=m=>{if(m.id!==id)return;cleanup();m.type==='result'?resolve(m.result):reject(Error(m.error||'WORKER_ERROR'));};
   const onExit=code=>{cleanup();worker=null;reject(Error(`Worker exited ${code}`));};
   const timer=setTimeout(()=>{cleanup();current.kill();worker=null;resolve({error:'CASE_TIMEOUT'});},timeoutMs);
   current.on('message',onMessage);current.on('exit',onExit);current.send({type:'run',id,pair,snapshot});
  });
 }
 try{
  for(let i=meta.results.length;i<sample.samples.length;i++){
   if(!constructionFresh(snapshot)){meta.stopReason='CONSTRUCTION_SNAPSHOT_EXPIRED';break;}
   if(fileHash(path.join(project,'package-lock.json'))!==meta.dependencyLockSha256||(meta.installedLockSha256&&(!fs.existsSync(path.join(frozen,'node_modules/.package-lock.json'))||fileHash(path.join(frozen,'node_modules/.package-lock.json'))!==meta.installedLockSha256))){meta.stopReason='DEPENDENCIES_CHANGED';break;}
   const pair=sample.samples[i],start=performance.now();let result;
   try{result=await one(pair,i);}catch(e){result={error:'WORKER_ERROR',detail:String(e.message)};worker?.kill();worker=null;}
   if(!constructionFresh(snapshot)){meta.stopReason='CONSTRUCTION_SNAPSHOT_EXPIRED';break;}
   meta.results.push({index:i,...pair,elapsedMs:Math.round(performance.now()-start),...result});
   saveAtomic(path.join(run,'results.json'),meta);
   console.log(`${i+1}/${sample.samples.length} ${pair.district} ${pair.start} -> ${pair.end}: ${result.error||result.distance||'NO_RESULT'}`);
  }
  if(meta.results.length===sample.samples.length)meta.stopReason='COMPLETE';
 }finally{stop();}
}else throw Error('Use --start after source approval, or --resume <run-dir>');
