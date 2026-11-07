import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createRouter} from '../src/routing.mjs';
import {createLocalRouteVerifier,stationEntrances} from '../src/local-route-verifier.mjs';
const load=n=>JSON.parse(gunzipSync(fs.readFileSync(`public/data/${n}.json.gz`)));
const graph=load('graph'),facilities=load('facilities'),report=JSON.parse(fs.readFileSync('reports/metro-distance-benchmark.json'));
const router=createRouter(graph),verify=createLocalRouteVerifier(graph,facilities);
const ids=[...new Set(report.results.filter(r=>r.error==='NO_CONNECTION').flatMap(r=>[r.startId,r.endId]))];
const stations=[];
for(const id of ids){
 const station=facilities.find(x=>x.id===id);if(!station)throw Error(`Missing station ${id}`);
 const entrances=stationEntrances(station,facilities),probes=[];
 for(const entry of entrances){
  const point=[entry.lat,entry.lon];
  const strict=router(point,point,{approachAllowed:(a,b)=>verify.approachAllowed(a,b,entry)});
  const relaxed=router(point,point,{approachAllowed:()=>true});
  probes.push({name:entry.name,id:entry.id,strict:strict.error,relaxedApproach:relaxed.error,nearestGraphNodeMetres:Number.isFinite(strict.startGap)?Math.round(strict.startGap):null});
 }
 const strictReachable=probes.some(p=>p.strict==='SAME_POINT'),relaxedReachable=probes.some(p=>p.relaxedApproach==='SAME_POINT');
 stations.push({id,name:station.name,strictReachable,relaxedReachable,probes});
 console.log(`${stations.length}/${ids.length} ${station.name}: ${strictReachable?'reachable':relaxedReachable?'approach evidence limited':'no eligible endpoint even after relaxing approach evidence'}`);
}
const byId=new Map(stations.map(s=>[s.id,s]));
const pairs=report.results.filter(r=>r.error==='NO_CONNECTION').map(r=>({start:r.start,end:r.end,startReachable:byId.get(r.startId)?.strictReachable,endReachable:byId.get(r.endId)?.strictReachable,startRelaxed:byId.get(r.startId)?.relaxedReachable,endRelaxed:byId.get(r.endId)?.relaxedReachable}));
fs.writeFileSync('reports/metro-distance-diagnostics.json',JSON.stringify({checkedAt:new Date().toISOString(),method:'For each station in NO_CONNECTION pairs, probe up to four selected entrances with and without only the entrance polygon/elevator condition; road-intersection and blocked-node rules remain. No construction in this isolated probe. SAME_POINT means an eligible snap was found, not that the route is safe or connected.',stations,pairs},null,2)+'\n');
