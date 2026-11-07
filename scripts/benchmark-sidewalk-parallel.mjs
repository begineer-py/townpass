// Compare current and experimental sidewalk improvement on fixed station pairs.
// Raw construction data remains in a newly created temporary directory.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const hashFile=p=>hash(fs.readFileSync(p));
const sourceHash=dir=>{
 const files=[];
 const walk=d=>{for(const item of fs.readdirSync(d,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const p=path.join(d,item.name);if(item.isDirectory())walk(p);else if(item.isFile())files.push(`${path.relative(dir,p).replaceAll('\\','/')} ${hashFile(p)}`);}};
 walk(dir);return hash(files.join('\n'));
};
const load=n=>JSON.parse(gunzipSync(fs.readFileSync(path.join(root,'public/data',`${n}.json.gz`))));
const args=process.argv.slice(2);
if(args[0]==='--worker'){
 const [,variant,trial]=args;
 if(!['baseline','candidate'].includes(variant)||!trial)throw Error('Invalid worker arguments');
 const src=path.join(trial,variant,'src');
 const mod=n=>import(pathToFileURL(path.join(src,n)).href);
 const {createOfficialConditionIndex}=await mod('official-conditions.mjs');
 const {createLocalRouteVerifier}=await mod('local-route-verifier.mjs');
 const {createVerifiedRouter,planImprovedPlaces}=await mod('pedestrian-planning.mjs');
 const {findRouteCandidates}=await mod('route-candidates.mjs');
 const {createConstructionChecker,constructionFresh}=await mod('construction.mjs');
 const graph=load('graph'),conditions=load('official-conditions');graph.officialConditionIndex=createOfficialConditionIndex(conditions);
 const facilities=load('facilities'),places=load('places'),allPairs=JSON.parse(fs.readFileSync(path.join(root,'reports/metro-distance-benchmark.json'))).results;
 const limit=process.env.BENCHMARK_LIMIT?Number(process.env.BENCHMARK_LIMIT):allPairs.length;
 if(!Number.isSafeInteger(limit)||limit<1||limit>allPairs.length)throw Error('Invalid BENCHMARK_LIMIT');
 const pairs=allPairs.slice(0,limit);
 const snapshot=JSON.parse(fs.readFileSync(path.join(trial,'snapshot.json')));
 const checker=createConstructionChecker(snapshot),verifyLocal=createLocalRouteVerifier(graph,facilities,places),router=createVerifiedRouter(graph,verifyLocal),deps={graph,facilities,verifyLocal,router,checker};
 const output=path.join(trial,`${variant}-results.json`),results=[];
 const summarize=(route,metrics)=>route?{distance:route.distance,sidewalk:metrics?.explicitSidewalkMetres??null,shared:metrics?.sharedMetres??null,unknown:metrics?.unknownMetres??null,score:metrics?.score??null,
  geometryHash:route.edgeIds?hash(JSON.stringify(route.edgeIds.map(id=>graph.edges[id]?.[5]?.derivedFrom??id))).slice(0,16):null,
  resolvedStart:route.resolvedStart?{id:route.resolvedStart.id,lat:route.resolvedStart.lat,lon:route.resolvedStart.lon}:null,resolvedEnd:route.resolvedEnd?{id:route.resolvedEnd.id,lat:route.resolvedEnd.lat,lon:route.resolvedEnd.lon}:null,
  officialConditionCount:route.officialConditions?.points?.filter(p=>p.distanceMetres<=2).length??null,approaches:route.approaches?.map(a=>({side:a.side,estimated:a.estimated,distance:a.distance})),constructionBlocked:route.construction?.blocked?.length??null}:null;
 for(const [i,pair] of pairs.entries()){
  if(!constructionFresh(snapshot))throw Error(`Construction snapshot expired; partial results: ${output}`);
  const start=facilities.find(p=>p.id===pair.startId),end=facilities.find(p=>p.id===pair.endId),time=performance.now();
  const row={index:i,bin:pair.bin,start:pair.start,end:pair.end,startId:pair.startId,endId:pair.endId};
  if(!start||!end)row.error='MISSING_STATION';
  else {
   const base=planImprovedPlaces(start,end,{officialOnly:false},snapshot,deps);
   row.error=base.error??null;row.improvement=base.pedestrianImprovement?.status??null;row.improvementReasons=base.pedestrianImprovement?.iterations?.flatMap(x=>x.reasons||[])??[];
   if(!base.error){
    const a=base.resolvedStart,b=base.resolvedEnd;
    const choices=findRouteCandidates(base,[a.lat,a.lon],[b.lat,b.lon],{officialOnly:false,startPlace:a,endPlace:b},snapshot,deps);
    const selected=choices.candidates?.[0],baseChoice=choices.candidates?.find(x=>x.id==='baseline');
    row.candidateStatus=choices.status??choices.error;row.candidateCount=choices.candidates?.length??0;
    row.base=summarize(base,baseChoice?.metrics);row.final=summarize(selected?.route,selected?{...selected.metrics,score:selected.score}:null);
    row.chosenId=selected?.id??null;row.attemptReasons=choices.attempts?.map(x=>x.reason)??[];
   }
  }
  row.ms=Math.round(performance.now()-time);results.push(row);
  fs.writeFileSync(output,JSON.stringify({variant,results},null,2));
  console.log(`${variant} ${i+1}/${pairs.length}: ${row.error||row.final?.distance||'NO_RESULT'} ${row.ms}ms`);
 }
}else{
 const trial=fs.mkdtempSync(path.join(os.tmpdir(),'townpass-sidewalk-compare-'));
 const {normalizeConstruction,constructionFresh}=await import(pathToFileURL(path.join(root,'src/construction.mjs')).href);
 let snapshot;
 if(process.env.BENCHMARK_SNAPSHOT)snapshot=JSON.parse(fs.readFileSync(process.env.BENCHMARK_SNAPSHOT));
 else{
  const response=await fetch('https://tpnco.blob.core.windows.net/blobfs/Todaywork.json',{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error(`Construction HTTP ${response.status}`);
  snapshot=normalizeConstruction(await response.json(),response.headers.get('last-modified'));
 }
 if(!constructionFresh(snapshot))throw Error('Construction snapshot unavailable or expired');
 const snapshotFile=path.join(trial,'snapshot.json');fs.writeFileSync(snapshotFile,JSON.stringify(snapshot));
 const dataNames=['graph','facilities','places','official-conditions'];
 const dataHashes=Object.fromEntries(dataNames.map(n=>[n,hashFile(path.join(root,'public/data',`${n}.json.gz`))]));
 dataHashes.fixedPairs=hashFile(path.join(root,'reports/metro-distance-benchmark.json'));
 for(const variant of ['baseline','candidate']){
  const dir=path.join(trial,variant);fs.mkdirSync(dir);fs.cpSync(path.join(root,'src'),path.join(dir,'src'),{recursive:true});
  fs.copyFileSync(path.join(root,'package.json'),path.join(dir,'package.json'));
  fs.symlinkSync(fs.realpathSync(path.join(root,'node_modules')),path.join(dir,'node_modules'),process.platform==='win32'?'junction':'dir');
 }
 const candidate=path.join(trial,'candidate/src/pedestrian-improvement.mjs');
 let code=fs.readFileSync(candidate,'utf8').replaceAll('\r\n','\n');
 const before="   let near=sidewalkBetter?hasNewSidewalkNearReplaced(graph,current,candidate,{radius,deadline,maxComparisons:config.maxComparisons??100000}):{near:false};\n   let reason='sidewalk-share-increased';\n   if(!near.near&&!near.limited&&sharedBetter){near=hasNewPedestrianNearShared(graph,current,candidate,{radius,deadline,maxComparisons:config.maxComparisons??100000});reason='shared-reduced';}\n   if(Date.now()>deadline){attempt.reason='time-limit';timedOut=true;break;}\n   if(!near.near){reject(attempt,near.limited?'proximity-limit':'no-connected-pedestrian-within-50m');if(near.limited)sawLimited=true;continue;}";
 if(!code.includes(before))throw Error(`Source differs from expected experiment; temp: ${trial}`);
 code=code.replace(before,"   let reason=sidewalkBetter?'sidewalk-share-increased':'shared-reduced';");fs.writeFileSync(candidate,code);
 const sourceHashes={baseline:sourceHash(path.join(trial,'baseline/src')),candidate:sourceHash(path.join(trial,'candidate/src'))};
 for(const variant of ['baseline','candidate']){
  const child=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--worker',variant,trial],{stdio:'inherit'});
  if(child.status!==0)throw Error(`${variant} failed or snapshot expired; partial files: ${trial}`);
  for(const n of dataNames)if(hashFile(path.join(root,'public/data',`${n}.json.gz`))!==dataHashes[n])throw Error(`Data changed during run: ${n}; partial files: ${trial}`);
  if(hashFile(path.join(root,'reports/metro-distance-benchmark.json'))!==dataHashes.fixedPairs)throw Error(`Station pairs changed during run; partial files: ${trial}`);
 }
 const report={method:'Two isolated source copies, sequential same graph and live construction snapshot; candidate removes only the 50m/5m parallel-proximity eligibility gate. Station pairs and configured runtime/search budgets unchanged. Scoring, verification, construction and endpoint constraints remain in use.',dataHashes,sourceHashes,
  conditions:{fetchedAt:load('official-conditions').fetchedAt,points:load('official-conditions').points.length},
  snapshot:{sha256:hashFile(snapshotFile),fetchedAt:snapshot.fetchedAt,sourceUpdatedAt:snapshot.sourceUpdatedAt,works:snapshot.works.length},
  baseline:JSON.parse(fs.readFileSync(path.join(trial,'baseline-results.json'))).results,candidate:JSON.parse(fs.readFileSync(path.join(trial,'candidate-results.json'))).results};
 const output=process.env.BENCHMARK_OUTPUT||path.join(root,'reports/sidewalk-parallel-comparison-new.json');
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(`Report: ${output}\nTemporary files, including raw snapshot: ${trial}`);
}
