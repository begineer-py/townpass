import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createLocalRouteVerifier,planPlaces} from '../src/local-route-verifier.mjs';
import {createVerifiedRouter,planImprovedPlaces} from '../src/pedestrian-planning.mjs';
import {measurePedestrianRoute} from '../src/pedestrian-improvement.mjs';
import {createConstructionChecker,constructionFresh} from '../src/construction.mjs';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=Object.fromEntries(['graph','facilities','places'].map(n=>[n,fs.readFileSync(`public/data/${n}.json.gz`)]));
const load=n=>JSON.parse(gunzipSync(files[n]));
const facilities=load('facilities'),places=load('places');
const input=JSON.parse(fs.readFileSync(process.env.BENCHMARK_INPUT||'reports/metro-round4-after.json'));
if(input.seed!==20261107||input.results?.length!==60)throw Error('Expected the fixed 60-station sample');
let snapshot;
if(process.env.BENCHMARK_SNAPSHOT)snapshot=JSON.parse(fs.readFileSync(process.env.BENCHMARK_SNAPSHOT,'utf8'));
else{const response=await fetch(process.env.BENCHMARK_URL||'http://127.0.0.1:5173/api/construction');
 if(!response.ok)throw Error(`Construction HTTP ${response.status}`);snapshot=await response.json();}
if(!constructionFresh(snapshot))throw Error('Construction snapshot stale');
const snapshotHash=hash(Buffer.from(JSON.stringify(snapshot.works))),byId=new Map(facilities.map(p=>[p.id,p]));
const codePaths=['src/routing.mjs','src/route-gap.mjs','src/local-route-verifier.mjs','src/pedestrian-improvement.mjs','src/pedestrian-planning.mjs','src/route-tiers.mjs','src/construction.mjs','src/geometry.mjs','src/supplemental-evidence.mjs','src/shared-road-policy.mjs','scripts/benchmark-metro-sidewalk-comparison.mjs'];
const codeHashes=Object.fromEntries(codePaths.map(path=>[path,hash(fs.readFileSync(path))]));
function context(){
 const graph=load('graph'),checker=createConstructionChecker(snapshot),verifyLocal=createLocalRouteVerifier(graph,facilities,places),router=createVerifiedRouter(graph,verifyLocal);
 return {graph,checker,verifyLocal,router,facilities};
}
function measure(route,graph,initMs,searchMs){
 if(route.error)return {success:false,error:route.error,initMs,searchMs};
 let network=0,shared=0,mapped=0,sidewalk=0,connector=0;
 for(const id of route.edgeIds||[]){const e=graph.edges[id],w=graph.ways[e[3]];network+=e[2];
  if(w.source==='osm-shared-street')shared+=e[2];
  else if(w.isConnector)connector+=e[2];
  else if(['footway','path','pedestrian','corridor'].includes(w.highway)){mapped+=e[2];if(w.highway==='footway'&&w.footway==='sidewalk')sidewalk+=e[2];}
 }
 const estimates=(route.approaches||[]).filter(a=>a.estimated),estimated=estimates.reduce((n,a)=>n+a.distance,0);
 const a=route.resolvedStart,b=route.resolvedEnd;
 const precise=a&&b?measurePedestrianRoute(graph,route,[a.lat,a.lon],[b.lat,b.lon]):null;
 if(!precise||!Number.isFinite(precise.distance)||precise.distance<=0)throw Error('Successful route is missing measurable endpoint or edge provenance');
 return {success:true,distance:route.distance,networkMetres:network,sharedMetres:shared,mappedPedestrianMetres:mapped,
  explicitSidewalkMetres:sidewalk,syntheticConnectorMetres:connector,estimatedApproachMetres:estimated,estimatedApproaches:estimates.length,
  exactDistanceMetres:precise?.distance??null,explicitSidewalkRatio:precise?.distance>0?sidewalk/precise.distance:null,
  resolvedStartId:route.resolvedStart?.id||null,resolvedEndId:route.resolvedEnd?.id||null,
  weightedCost:route.weightedCost??null,constructionBlocked:route.construction?.blocked?.length??null,
  optimization:route.pedestrianImprovement||null,initMs,searchMs};
}
const target=process.env.BENCHMARK_OUTPUT||'reports/metro-sidewalk-comparison.json',partial=target+'.partial';
const freshReport={status:'running',startedAt:new Date().toISOString(),sampleSeed:input.seed,total:input.results.length,
 method:'Paired local station routes: independent freshly parsed graph/router per baseline and optimized run, identical captured graph and construction snapshot. Explicit sidewalk is only OSM footway=sidewalk; mapped pedestrian includes footway/path/pedestrian/corridor, excluding synthetic connectors. Distances are data outputs, not real-world accessibility. No official online route or real-time elevator maintenance.',
 graphSha256:hash(files.graph),facilitiesSha256:hash(files.facilities),placesSha256:hash(files.places),codeHashes,
 constructionFetchedAt:snapshot.fetchedAt,constructionUpdatedAt:snapshot.sourceUpdatedAt,constructionWorksSha256:snapshotHash,results:[]};
const report=process.env.BENCHMARK_RESUME==='1'&&fs.existsSync(partial)?JSON.parse(fs.readFileSync(partial)):freshReport;
if(report!==freshReport){
 if(report.status!=='running'||report.sampleSeed!==input.seed||report.total!==input.results.length||
    report.graphSha256!==hash(files.graph)||report.facilitiesSha256!==hash(files.facilities)||report.placesSha256!==hash(files.places)||
    report.constructionWorksSha256!==snapshotHash||report.constructionFetchedAt!==snapshot.fetchedAt||report.constructionUpdatedAt!==snapshot.sourceUpdatedAt||
    codePaths.some(path=>report.codeHashes[path]!==codeHashes[path])||
    report.results.some((row,i)=>row.startId!==input.results[i].startId||row.endId!==input.results[i].endId))
   throw Error('Partial result does not match the exact input snapshot, data, code, or sample');
 report.resumedWithIsolatedProcesses=true;
}
const maxCases=process.env.BENCHMARK_MAX_CASES?Number(process.env.BENCHMARK_MAX_CASES):Infinity;
if(!(maxCases>0))throw Error('Invalid BENCHMARK_MAX_CASES');
function save(path){fs.writeFileSync(path,JSON.stringify(report,null,2)+'\n');}
const first=report.results.length;
for(const [i,row] of input.results.entries()){
 if(i<first)continue;
 if(i>=first+maxCases)break;
 if(!constructionFresh(snapshot))throw Error(`Snapshot expired after ${i} pairs; partial report retained`);
 const start=byId.get(row.startId),end=byId.get(row.endId);if(!start||!end)throw Error(`Missing station ${row.startId}/${row.endId}`);
 const options={officialOnly:false};let t=performance.now(),ctx=context(),initMs=Math.round(performance.now()-t);t=performance.now();
 let route=planPlaces(start,end,options,snapshot,ctx),baseline=measure(route,ctx.graph,initMs,Math.round(performance.now()-t));
 route=null;ctx=null;globalThis.gc?.();t=performance.now();ctx=context();initMs=Math.round(performance.now()-t);t=performance.now();
 route=planImprovedPlaces(start,end,options,snapshot,ctx);const optimized=measure(route,ctx.graph,initMs,Math.round(performance.now()-t));
 const sameResolved=baseline.success&&optimized.success?baseline.resolvedStartId===optimized.resolvedStartId&&baseline.resolvedEndId===optimized.resolvedEndId:null;
 const pairChecks=sameResolved&&baseline.exactDistanceMetres&&optimized.exactDistanceMetres?{
  sidewalkRatioDelta:optimized.explicitSidewalkRatio-baseline.explicitSidewalkRatio,
  sharedDeltaMetres:optimized.sharedMetres-baseline.sharedMetres,
  distanceDeltaMetres:optimized.exactDistanceMetres-baseline.exactDistanceMetres,
  detourWithinBothLimits:optimized.exactDistanceMetres<=Math.min(baseline.exactDistanceMetres*1.3,baseline.exactDistanceMetres+300)+1e-6
 }:null;
 report.results.push({bin:row.bin,start:row.start,end:row.end,startId:row.startId,endId:row.endId,straightMetres:row.straightMetres,baseline,optimized,sameResolved,pairChecks});
 console.log(`${i+1}/60 ${row.start} -> ${row.end}: ${baseline.error||'OK'} / ${optimized.error||optimized.optimization?.status||'OK'}`);
 route=null;ctx=null;globalThis.gc?.();report.memoryAfterCase=process.memoryUsage();save(partial);
}
if(report.results.length<input.results.length){console.log(JSON.stringify({status:'partial',completed:report.results.length,total:input.results.length,memory:report.memoryAfterCase}));process.exit(0);}
const ok=which=>report.results.filter(x=>x[which].success).map(x=>x[which]);
const summarize=which=>{const rows=ok(which),sum=key=>rows.reduce((n,r)=>n+(r[key]||0),0),times=report.results.map(x=>x[which].searchMs).sort((a,b)=>a-b);
 return {success:rows.length,total:report.results.length,estimatedRoutes:rows.filter(r=>r.estimatedApproaches>0).length,
  distanceMetres:sum('distance'),exactDistanceMetres:sum('exactDistanceMetres'),networkMetres:sum('networkMetres'),mappedPedestrianMetres:sum('mappedPedestrianMetres'),
  explicitSidewalkMetres:sum('explicitSidewalkMetres'),sharedMetres:sum('sharedMetres'),estimatedApproachMetres:sum('estimatedApproachMetres'),
  searchMsMedian:times[Math.floor((times.length-1)*.5)],searchMsP95:times[Math.floor((times.length-1)*.95)]};};
report.status='complete';report.completedAt=new Date().toISOString();report.baseline=summarize('baseline');report.optimized=summarize('optimized');
report.graphChangedDuringRun=hash(fs.readFileSync('public/data/graph.json.gz'))!==report.graphSha256;
report.codeChangedDuringRun=codePaths.filter(path=>hash(fs.readFileSync(path))!==codeHashes[path]);
report.endpointPairsChanged=report.results.filter(x=>x.sameResolved===false).length;
report.sidewalkRatioDecreasedPairs=report.results.filter(x=>x.pairChecks&&x.pairChecks.sidewalkRatioDelta < -1e-9).length;
report.sharedIncreasedPairs=report.results.filter(x=>x.pairChecks&&x.pairChecks.sharedDeltaMetres > 1e-6).length;
report.detourLimitExceededPairs=report.results.filter(x=>x.pairChecks&&!x.pairChecks.detourWithinBothLimits).length;
save(partial);fs.renameSync(partial,target);console.log(JSON.stringify({baseline:report.baseline,optimized:report.optimized,graphChangedDuringRun:report.graphChangedDuringRun,codeChangedDuringRun:report.codeChangedDuringRun,endpointPairsChanged:report.endpointPairsChanged}));
