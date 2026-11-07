import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
import {metres} from '../src/routing.mjs';
import {validateNetwork} from '../src/network-contract.mjs';
import {createLocalRouteVerifier} from '../src/local-route-verifier.mjs';
import {createVerifiedRouter,planImprovedPlaces} from '../src/pedestrian-planning.mjs';
import {constructionFresh,createConstructionChecker} from '../src/construction.mjs';

export const ADDRESS_MAP_SEED=20261114;
export const BINS=[{label:'0.5–1 km',min:500,max:1000},{label:'1–2 km',min:1000,max:2000},{label:'2–4 km',min:2000,max:4000},{label:'4–8 km',min:4000,max:8000}];
const hash=b=>createHash('sha256').update(b).digest('hex');
const pointOkay=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&p.lat>24.94&&p.lat<25.24&&p.lon>121.42&&p.lon<121.69;
const shuffle=(rows,random)=>{const a=[...rows];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const makeRandom=seed=>{let state=seed;return ()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/2**32);};

export function sampleAddressMap(stations,records,{seed=ADDRESS_MAP_SEED,perKind=6}={}){
 if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)throw Error('Invalid seed');
 const random=makeRandom(seed),dedup=new Map();
 for(const p of stations.filter(p=>pointOkay(p)&&String(p.kind)==='20'&&/臺北市|台北市/.test(p.address||'')).sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'))){
  const key=p.name.replace(/臺/g,'台').replace(/[（(][^）)]*[）)]/g,'').trim();if(!dedup.has(key))dedup.set(key,p);
 }
 const stationPool=[...dedup.values()],shuffled=shuffle(records.filter(pointOkay),random),mid=Math.floor(shuffled.length/2);
 const sources={address:shuffled.slice(0,mid),map:shuffled.slice(mid)},cases=[],used=new Set(),poolCounts=[];
 const mapPoints=sources.map.map((p,i)=>{
  const angle=random()*2*Math.PI,distance=15+65*random();
  return {...p,lat:p.lat+Math.cos(angle)*distance/111195,lon:p.lon+Math.sin(angle)*distance/100700,reference:p,offsetMetres:distance,syntheticId:seed*100000+i};
 }).filter(pointOkay);
 for(const bin of BINS)for(const kind of ['address','map']){
  const points=kind==='address'?sources.address:mapPoints,pool=[];
  for(const point of points)for(const station of stationPool){const d=metres([point.lat,point.lon],[station.lat,station.lon]);if(d>=bin.min&&d<bin.max)pool.push({point,station,straightMetres:Math.round(d)});}
  const ordered=shuffle(pool,random),selected=[];
  for(const row of ordered){const key=row.point.reference?.key||row.point.key;if(used.has(key))continue;used.add(key);selected.push(row);if(selected.length===perKind)break;}
  if(selected.length<perKind)throw Error(`Insufficient distinct ${kind} cases for ${bin.label}`);
  poolCounts.push({bin:bin.label,kind,pairs:pool.length});
  for(let i=0;i<selected.length;i++){
   const row=selected[i],side=i%2===0?'start':'end',p=row.point;
   const chosen=kind==='address'?{id:`address-${p.lat}-${p.lon}-0`,kind:'place',sourceId:'osm',selectionKind:'user',name:p.name,lat:p.lat,lon:p.lon}
    :{id:`point-${p.syntheticId}`,originKind:'map',selectionKind:'user',name:'地圖上選的位置',lat:p.lat,lon:p.lon};
   cases.push({bin:bin.label,kind,selectedSide:side,start:side==='start'?chosen:row.station,end:side==='end'?chosen:row.station,straightMetres:row.straightMetres,
    reference:{name:(p.reference||p).name,coordinate:[(p.reference||p).lat,(p.reference||p).lon],streetFile:(p.reference||p).file},mapOffsetMetres:kind==='map'?Math.round(p.offsetMetres*10)/10:null});
  }
 }
 return {stationCount:stationPool.length,cases,poolCounts};
}
const load=n=>JSON.parse(gunzipSync(fs.readFileSync(`public/data/${n}.json.gz`)));
if(!isMainThread){
 const {entry,snapshot}=workerData,begin=performance.now(),graph=load('graph'),facilities=load('facilities'),places=load('places');validateNetwork(graph);
 const verifier=createLocalRouteVerifier(graph,facilities,places),router=createVerifiedRouter(graph,verifier),checker=createConstructionChecker(snapshot);
 const options={avoidSteps:true,minWidth:.6,maxSlope:15,knownOnly:false,officialOnly:false,preferOfficial:true,mode:'balanced'};
 const result=planImprovedPlaces(entry.start,entry.end,options,snapshot,{graph,router,verifyLocal:verifier,facilities,checker});
 const segments=result.tierSegments||[],estimated=(result.approaches||[]).filter(p=>p.estimated);
 parentPort.postMessage({success:!result.error,error:result.error||null,distance:result.distance??null,
  sharedMetres:segments.filter(s=>s.sharedRoad).reduce((n,s)=>n+s.distance,0),pedestrianMetres:segments.filter(s=>!s.sharedRoad).reduce((n,s)=>n+s.distance,0),
  footwayMetres:result.pedestrianImprovement?.footwayMetres??null,explicitSidewalkMetres:result.pedestrianImprovement?.explicitSidewalkMetres??null,
  estimatedApproaches:estimated.map(a=>({side:a.side,distance:a.distance,originKind:a.originKind||null,unconfirmed:a.unconfirmed??null})),
  pedestrianImprovement:result.pedestrianImprovement||null,elapsedMs:Math.round(performance.now()-begin)});
}else if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const seed=Number(process.env.BENCHMARK_SEED||ADDRESS_MAP_SEED);if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)throw Error('Invalid seed');
 const indexBytes=fs.readFileSync('public/data/address-index.json'),roads=JSON.parse(indexBytes).filter(x=>/臺北市|台北市/.test(x.street)).sort((a,b)=>a.file.localeCompare(b.file,'en'));
 const previous=JSON.parse(fs.readFileSync('reports/selected-address-benchmark.json')),excluded=new Set((previous.results||[]).map(x=>`${x.address.name}\0${x.address.coordinate.join(',')}`));
 const rng=makeRandom(seed^0x9e3779b9),reservoir=[],seen=new Set(),digest=createHash('sha256');let validCount=0,excludedCount=0;
 for(const road of roads){
  const bytes=fs.readFileSync(`public/data/addresses/${road.file}.json`);digest.update(road.file).update('\0').update(hash(bytes));
  for(const row of JSON.parse(bytes)){
   if(!Array.isArray(row)||typeof row[0]!=='string'||!row[0].trim())continue;
   const item={name:row[0],lat:row[1],lon:row[2],file:road.file};if(!pointOkay(item))continue;
   const key=`${item.name}\0${item.lat},${item.lon}`;if(excluded.has(key)){excludedCount++;continue;}if(seen.has(key))continue;seen.add(key);item.key=key;
   validCount++;if(reservoir.length<2000)reservoir.push(item);else{const j=Math.floor(rng()*validCount);if(j<2000)reservoir[j]=item;}
  }
 }
 const facilities=load('facilities'),sample=sampleAddressMap(facilities,reservoir,{seed});
 if(process.env.BENCHMARK_SAMPLE_ONLY==='1'){
  console.log(JSON.stringify({seed,total:sample.cases.length,stationCount:sample.stationCount,validCount,excludedCount,poolCounts:sample.poolCounts}));
  process.exit(0);
 }
 const response=await fetch(process.env.BENCHMARK_URL||'http://127.0.0.1:5173/api/construction');if(!response.ok)throw Error(`Construction HTTP ${response.status}`);
 const snapshotBytes=Buffer.from(await response.arrayBuffer()),snapshot=JSON.parse(snapshotBytes);if(!constructionFresh(snapshot))throw Error('CONSTRUCTION_UNAVAILABLE');
 const filePaths=['graph','facilities','places'].map(x=>`public/data/${x}.json.gz`),fileHashes=filePaths.map(p=>hash(fs.readFileSync(p)));
 function run(entry){return new Promise(resolve=>{
  const worker=new Worker(new URL(import.meta.url),{workerData:{entry,snapshot}});let complete=false;
  const finish=async value=>{if(complete)return;complete=true;clearTimeout(timer);await worker.terminate();resolve(value);};
  const timer=setTimeout(()=>void finish({error:'SEARCH_TIMEOUT'}),45000);
  worker.on('message',value=>void finish(value));worker.on('error',error=>void finish({error:'WORKER_ERROR',message:error.message}));worker.on('exit',code=>{if(!complete)void finish({error:'WORKER_EXIT',code});});
 });}
 const results=[];
 for(const [i,entry] of sample.cases.entries()){
  const outcome=constructionFresh(snapshot)?await run(entry):{error:'CONSTRUCTION_UNAVAILABLE'};
  results.push({...entry,...outcome});console.log(`${i+1}/${sample.cases.length} ${entry.bin} ${entry.kind} ${entry.selectedSide}: ${outcome.error||'OK'}`);
 }
 if(filePaths.some((p,i)=>hash(fs.readFileSync(p))!==fileHashes[i]))throw Error('Graph or POI data changed during benchmark');
 const tested=results.filter(r=>r.success===true||r.success===false),ok=tested.filter(r=>r.success),byBin=BINS.map(bin=>{const rows=tested.filter(r=>r.bin===bin.label);return {bin:bin.label,total:rows.length,success:rows.filter(r=>r.success).length,errors:Object.fromEntries([...new Set(rows.filter(r=>r.error).map(r=>r.error))].map(e=>[e,rows.filter(r=>r.error===e).length]))};});
 const report={checkedAt:new Date().toISOString(),seed,method:'Seeded distance-stratified sample: public address index records and simulated map selections offset 15–80m from distinct public addresses, paired with Taipei metro stations; equally stratified types and directions, not filtered by route connectivity. One fresh worker per case, current local product planner with ordinary walking profile and one fresh construction snapshot. Address points and map points may be inside buildings, private areas, water or other unavailable locations. Nearby alternatives are not selected. Success means only a route result to the selected coordinates and is not physical accessibility, official online routing, live GPS, or citywide success.',
  sources:{graphSha256:fileHashes[0],facilitiesSha256:fileHashes[1],placesSha256:fileHashes[2],addressIndexSha256:hash(indexBytes),taipeiAddressShardSetSha256:digest.digest('hex'),previousAddressSampleSha256:hash(fs.readFileSync('reports/selected-address-benchmark.json')),constructionSnapshotSha256:hash(snapshotBytes),constructionFetchedAt:snapshot.fetchedAt,constructionUpdatedAt:snapshot.sourceUpdatedAt},
  sampling:{stationCount:sample.stationCount,taipeiStreetFiles:roads.length,eligibleAddressRecords:validCount,previousSampleExcluded:excludedCount,reservoirCount:reservoir.length,poolCounts:sample.poolCounts},
  total:results.length,tested:tested.length,success:ok.length,executionErrors:results.length-tested.length,estimatedRoutes:ok.filter(r=>r.estimatedApproaches.length).length,
  sharedMetres:ok.reduce((n,r)=>n+r.sharedMetres,0),pedestrianMetres:ok.reduce((n,r)=>n+r.pedestrianMetres,0),footwayMetres:ok.reduce((n,r)=>n+(r.footwayMetres||0),0),explicitSidewalkMetres:ok.reduce((n,r)=>n+(r.explicitSidewalkMetres||0),0),routeMetres:ok.reduce((n,r)=>n+r.distance,0),byBin,results};
 fs.writeFileSync(process.env.BENCHMARK_OUTPUT||'reports/address-map-benchmark.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({total:report.total,tested:report.tested,success:report.success,executionErrors:report.executionErrors,estimatedRoutes:report.estimatedRoutes,byBin}));
}
