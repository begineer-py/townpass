import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createRouter,metres,edgeAllowed} from '../src/routing.mjs';
import {createLocalRouteVerifier,planPlaces} from '../src/local-route-verifier.mjs';
import {createConstructionChecker,constructionFresh} from '../src/construction.mjs';
import {roadConnectorChecker} from '../src/geometry.mjs';
import {officialGeometryEvidence} from '../src/supplemental-evidence.mjs';

const seed=20261113;let state=seed;
const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/2**32);
const shuffle=rows=>{const a=[...rows];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const files=['public/data/graph.json.gz','public/data/facilities.json.gz','public/data/places.json.gz'];
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex'),before=files.map(hash);
const load=n=>JSON.parse(gunzipSync(fs.readFileSync(`public/data/${n}.json.gz`)));
const graph=load('graph'),facilities=load('facilities'),places=load('places'),prior=JSON.parse(fs.readFileSync(process.env.GPS_BENCHMARK_INPUT||'reports/metro-round4-after.json'));
const response=await fetch(process.env.BENCHMARK_URL||'http://127.0.0.1:5173/api/construction');if(!response.ok)throw Error(`Construction HTTP ${response.status}`);
const snapshot=await response.json();if(!constructionFresh(snapshot))throw Error('CONSTRUCTION_UNAVAILABLE');
const router=createRouter(graph),verifyLocal=createLocalRouteVerifier(graph,facilities,places),checker=createConstructionChecker(snapshot),roadClear=roadConnectorChecker(graph.roadGeometries,officialGeometryEvidence(graph).crossings);
const options={officialOnly:false},data=shuffle(prior.results.filter(r=>r.success)),rejected=[],samples=[];
const anchorFrom=route=>{
 const segments=[];
 for(let i=0;i<route.edgeIds.length;i++){
  const e=graph.edges[route.edgeIds[i]],w=graph.ways[e[3]];
  if(!['footway','path','pedestrian','corridor'].includes(w.highway)||w.gradeSeparatedPedestrian||(w.bridge&&w.bridge!=='no')||(w.tunnel&&w.tunnel!=='no')||
     (w.layer!=null&&String(w.layer)!=='0')||(w.level!=null&&String(w.level)!=='0')||!edgeAllowed(w,options,e[5]))continue;
  const middle=e[0]===route.nodeIds[i]?(e[4]||[]):[...(e[4]||[])].reverse(),line=[graph.nodes[route.nodeIds[i]].slice(0,2),...middle,graph.nodes[route.nodeIds[i+1]].slice(0,2)];
  for(let j=1;j<line.length;j++){const length=metres(line[j-1],line[j]);if(length>=6)segments.push({a:line[j-1],b:line[j],length,edgeId:route.edgeIds[i],osmWayId:w.osmId??null});}
 }
 if(!segments.length)return null;
 const s=segments[Math.floor(segments.length/2)];return {coordinate:[(s.a[0]+s.b[0])/2,(s.a[1]+s.b[1])/2],edgeId:s.edgeId,osmWayId:s.osmWayId,length:s.length};
};
for(const row of data){
 if(samples.length===10)break;
 if(!constructionFresh(snapshot))throw Error('CONSTRUCTION_UNAVAILABLE');
 const start=facilities.find(p=>p.id===row.startId),end=facilities.find(p=>p.id===row.endId);
 if(!start||!end){rejected.push({startId:row.startId,endId:row.endId,reason:'MISSING_STATION'});continue;}
 const original=planPlaces(start,end,options,snapshot,{router,verifyLocal,facilities,checker});
 if(original.error){rejected.push({startId:row.startId,endId:row.endId,reason:original.error});continue;}
 const anchor=anchorFrom(original);if(!anchor){rejected.push({startId:row.startId,endId:row.endId,reason:'NO_GROUND_PEDESTRIAN_SEGMENT'});continue;}
 // One reproducible direction per original route; distances are local metres.
 const angle=random()*2*Math.PI,sample={start:start.name,end:end.name,startId:start.id,endId:end.id,priorBin:row.bin,anchor,angleRadians:angle,offsets:[]};
 for(const distance of [3,10,25]){
  const gps=[anchor.coordinate[0]+Math.cos(angle)*distance/111195,anchor.coordinate[1]+Math.sin(angle)*distance/100700],place={id:'my-location',name:'模擬 GPS 起點',originKind:'gps',locationSource:'browser',accuracy:5,needsConfirmation:false,lat:gps[0],lon:gps[1]};
  const directRoadClear=roadClear(gps,anchor.coordinate),directConstructionClear=checker.allowed([gps,anchor.coordinate]),started=performance.now();
  const result=planPlaces(place,end,options,snapshot,{router,verifyLocal,facilities,checker});
  const approach=result.approaches?.find(p=>p.side==='start'&&p.originKind==='gps');
  sample.offsets.push({offsetMetres:distance,gps,success:!result.error,error:result.error||null,routeDistance:result.distance??null,estimatedApproach:approach?{distance:approach.distance,coordinates:approach.coordinates,estimated:approach.estimated,unconfirmed:approach.unconfirmed,entryStatus:approach.entryStatus,roadMaskClear:roadClear(approach.coordinates[0],approach.coordinates.at(-1)),constructionClear:checker.allowed(approach.coordinates)}:null,directRoadClear,directConstructionClear,elapsedMs:Math.round(performance.now()-started)});
  console.log(`${samples.length+1}/10 ${distance}m ${start.name} → ${end.name}: ${result.error||'OK'}`);
 }
 samples.push(sample);
}
if(samples.length!==10)throw Error(`Insufficient valid reference routes: ${samples.length}/10`);
if(files.some((p,i)=>hash(p)!==before[i]))throw Error('Input data changed during benchmark');
const summary=[3,10,25].map(offset=>{const rows=samples.flatMap(s=>s.offsets).filter(r=>r.offsetMetres===offset),ok=rows.filter(r=>r.success);return {offsetMetres:offset,total:rows.length,success:ok.length,estimatedWarning:ok.filter(r=>r.estimatedApproach?.estimated&&r.estimatedApproach?.unconfirmed).length,successfulConnectorFailedRoadCheck:ok.filter(r=>r.estimatedApproach&&!r.estimatedApproach.roadMaskClear).length,successfulConnectorFailedConstructionCheck:ok.filter(r=>r.estimatedApproach&&!r.estimatedApproach.constructionClear).length,successWithoutEstimatedApproach:ok.filter(r=>!r.estimatedApproach).length,errors:Object.fromEntries([...new Set(rows.filter(r=>r.error).map(r=>r.error))].map(e=>[e,rows.filter(r=>r.error===e).length])),directRoadConflict:rows.filter(r=>!r.directRoadClear).length,directConstructionConflict:rows.filter(r=>!r.directConstructionClear).length};});
const report={checkedAt:new Date().toISOString(),seed,sourceBenchmark:process.env.GPS_BENCHMARK_INPUT||'reports/metro-round4-after.json',constructionFetchedAt:snapshot.fetchedAt,constructionUpdatedAt:snapshot.sourceUpdatedAt,graphSha256:before[0],facilitiesSha256:before[1],placesSha256:before[2],method:'Fixed-seed selection from previously successful metro station pairs; revalidate original route, then simulate one GPS point 3/10/25m from the midpoint of a mapped ground pedestrian segment in one random direction per route. Local route only with fresh construction snapshot and current destination; accuracy 5m is simulated. Direct road/construction checks refer only to the original anchor connector, not necessarily the connector the router chooses. Not a live GPS test, off-route detector test, citywide rate, or physical safety guarantee.',rejected,samples,summary};
fs.writeFileSync(process.env.GPS_BENCHMARK_OUTPUT||'reports/gps-offset-benchmark.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(summary));
