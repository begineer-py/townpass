import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {Worker,isMainThread,parentPort,workerData} from 'node:worker_threads';
import {performance} from 'node:perf_hooks';
import {createRouter} from '../src/routing.mjs';
import {createLocalRouteVerifier,planPlaces} from '../src/local-route-verifier.mjs';
import {constructionFresh,createConstructionChecker} from '../src/construction.mjs';
import {createNearbyRoutes} from '../src/nearby-routes.mjs';

const load=n=>JSON.parse(gunzipSync(fs.readFileSync(`public/data/${n}.json.gz`)));
if(!isMainThread){
 const begin=performance.now(),{row,snapshot}=workerData;
 const graph=load('graph'),facilities=load('facilities'),places=load('places'),all=new Map([...places,...facilities].map(p=>[p.id,p]));
 const start=all.get(row.start.id),end=all.get(row.end.id);
 if(!start||!end)throw Error('A sampled source place is missing');
 const router=createRouter(graph),verifyLocal=createLocalRouteVerifier(graph,facilities,places),checker=createConstructionChecker(snapshot),options={officialOnly:false};
 const original=planPlaces(start,end,options,snapshot,{router,verifyLocal,facilities,checker});
 let nearby=null;
 if(original.error){
  // The UI uses a separate worker after the failed route, so rebuild from
  // pristine graph data instead of reusing that router's derived nodes.
  const cleanGraph=load('graph'),cleanRouter=createRouter(cleanGraph),cleanVerifier=createLocalRouteVerifier(cleanGraph,facilities,places);
  const find=createNearbyRoutes(cleanGraph,{router:cleanRouter,verifyLocal:cleanVerifier,facilities});nearby=find(start,end,options,snapshot,checker);
 }
 parentPort.postMessage({originalError:original.error||null,originalSuccess:!original.error,nearby,elapsedMs:Math.round(performance.now()-begin)});
}else{
 const input=process.env.NEARBY_BENCHMARK_INPUT||'reports/mixed-place-after-floor.json',prior=JSON.parse(fs.readFileSync(input)),rows=prior.results.filter(r=>!r.success);
 const response=await fetch(process.env.BENCHMARK_URL||'http://127.0.0.1:5173/api/construction');if(!response.ok)throw Error(`Construction HTTP ${response.status}`);
 const snapshot=await response.json();if(!constructionFresh(snapshot))throw Error('CONSTRUCTION_UNAVAILABLE');
 const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),graphHash=hash('public/data/graph.json.gz'),placesHash=hash('public/data/places.json.gz');
 function run(row){return new Promise(resolve=>{
  const w=new Worker(new URL(import.meta.url),{workerData:{row,snapshot}});let complete=false;
  const finish=value=>{if(complete)return;complete=true;clearTimeout(timer);void w.terminate();resolve(value);};
  const timer=setTimeout(()=>finish({error:'SEARCH_TIMEOUT'}),45000);
  w.on('message',value=>finish(value));w.on('error',error=>finish({error:'WORKER_ERROR',message:error.message}));
  w.on('exit',code=>{if(!complete)finish({error:'WORKER_EXIT',code});});
 });}
 const results=[];
 for(const [i,row] of rows.entries()){
  if(!constructionFresh(snapshot)){results.push({start:row.start,end:row.end,error:'CONSTRUCTION_UNAVAILABLE'});continue;}
  const outcome=await run(row);if(outcome.nearby?.error)outcome.error=outcome.nearby.error;
  const candidates=outcome.nearby?.candidates||[];
  results.push({bin:row.bin,type:row.type,start:row.start,end:row.end,originalPriorError:row.error,...outcome,
    nearbyStartCount:candidates.filter(c=>c.side==='start').length,nearbyEndCount:candidates.filter(c=>c.side==='end').length});
  console.log(`${i+1}/${rows.length} ${row.start.name} → ${row.end.name}: ${outcome.error||outcome.originalError||'ORIGINAL_OK'}; nearby ${candidates.length}`);
 }
 if(hash('public/data/graph.json.gz')!==graphHash||hash('public/data/places.json.gz')!==placesHash)throw Error('Input data changed during benchmark');
 const tested=results.filter(r=>!r.error),failedOriginal=tested.filter(r=>!r.originalSuccess),offered=failedOriginal.filter(r=>r.nearbyStartCount+r.nearbyEndCount>0);
 const report={checkedAt:new Date().toISOString(),input,constructionFetchedAt:snapshot.fetchedAt,constructionUpdatedAt:snapshot.sourceUpdatedAt,graphSha256:graphHash,placesSha256:placesHash,
  method:'Each previously failed sample is retested with current local routing and a fresh per-case worker, fixed public source data and a shared fresh construction snapshot. Nearby candidates are independently routed to/from the other endpoint; they are not building entrances, do not reach the original place, are never selected automatically, and do not count as original-route success. Worker timeout 45s includes original route and candidate lookup, so it is not direct UI latency. This is not a citywide or physical-accessibility rate.',
  priorFailures:rows.length,tested:tested.length,executionErrors:results.filter(r=>r.error).length,originalFullSuccess:tested.filter(r=>r.originalSuccess).length,originalStillFailed:failedOriginal.length,nearbyOffered:offered.length,
  nearbyStartOffered:failedOriginal.filter(r=>r.nearbyStartCount>0).length,nearbyEndOffered:failedOriginal.filter(r=>r.nearbyEndCount>0).length,results};
 fs.writeFileSync(process.env.NEARBY_BENCHMARK_OUTPUT||'reports/nearby-failure-benchmark.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({priorFailures:report.priorFailures,tested:report.tested,executionErrors:report.executionErrors,originalFullSuccess:report.originalFullSuccess,originalStillFailed:report.originalStillFailed,nearbyOffered:report.nearbyOffered,nearbyStartOffered:report.nearbyStartOffered,nearbyEndOffered:report.nearbyEndOffered}));
}
