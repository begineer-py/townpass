import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {metres} from '../src/routing.mjs';
import {createLocalRouteVerifier} from '../src/local-route-verifier.mjs';
import {createVerifiedRouter,planImprovedPlaces} from '../src/pedestrian-planning.mjs';
import {createConstructionChecker} from '../src/construction.mjs';

const seed=Number(process.env.BENCHMARK_SEED||20261107);if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)throw Error('Invalid benchmark seed');let state=seed;
const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/2**32);
const load=name=>JSON.parse(gunzipSync(fs.readFileSync(`public/data/${name}.json.gz`)));
const graph=load('graph'),facilities=load('facilities'),places=load('places');
const records=facilities.filter(p=>String(p.kind)==='20'&&/臺北市|台北市/.test(p.address||'')).sort((a,b)=>a.id.localeCompare(b.id,'en'));
const byStation=new Map();for(const p of records){const key=p.name.replace(/臺/g,'台').replace(/[（(][^）)]*[）)]/g,'').trim();if(!byStation.has(key))byStation.set(key,p);}
const stations=[...byStation.values()];
const bins=[{label:'0.5–1 km',min:500,max:1000},{label:'1–2 km',min:1000,max:2000},{label:'2–4 km',min:2000,max:4000},{label:'4–8 km',min:4000,max:8000}];
for(const bin of bins)bin.pool=[];
for(let i=0;i<stations.length;i++)for(let j=i+1;j<stations.length;j++){
 const a=stations[i],b=stations[j],d=metres([a.lat,a.lon],[b.lat,b.lon]);
 const bin=bins.find(x=>d>=x.min&&d<x.max);if(bin)bin.pool.push({start:a,end:b,straightMetres:Math.round(d)});
}
for(const bin of bins){for(let i=bin.pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[bin.pool[i],bin.pool[j]]=[bin.pool[j],bin.pool[i]];}}
const endpoint=process.env.BENCHMARK_URL||'http://127.0.0.1:5173/api/construction';
let snapshot;
if(process.env.BENCHMARK_SNAPSHOT) snapshot=JSON.parse(fs.readFileSync(process.env.BENCHMARK_SNAPSHOT,'utf8'));
else {const response=await fetch(endpoint);if(!response.ok)throw Error(`Construction HTTP ${response.status}`);snapshot=await response.json();}
const checker=createConstructionChecker(snapshot);
const empty={...snapshot,works:[]},emptyChecker=createConstructionChecker(empty);
const verifyLocal=createLocalRouteVerifier(graph,facilities,places),router=createVerifiedRouter(graph,verifyLocal);
const deps={graph,router,verifyLocal,facilities,checker};
const results=[];
for(const bin of bins){
 for(const {start,end,straightMetres} of bin.pool.slice(0,15)){
  const r=planImprovedPlaces(start,end,{officialOnly:false},snapshot,deps);
  let withoutConstruction=null;
  if(r.error){const d=planImprovedPlaces(start,end,{officialOnly:false},empty,{...deps,checker:emptyChecker});withoutConstruction={success:!d.error,error:d.error||null};}
  const segments=r.tierSegments||[],sharedMetres=segments.filter(s=>s.sharedRoad).reduce((n,s)=>n+s.distance,0),pedestrianMetres=segments.filter(s=>!s.sharedRoad).reduce((n,s)=>n+s.distance,0);
  const row={bin:bin.label,start:start.name,end:end.name,startId:start.id,endId:end.id,startCoordinate:[start.lat,start.lon],endCoordinate:[end.lat,end.lon],straightMetres,success:!r.error,error:r.error||null,distance:r.distance??null,sharedRoad:sharedMetres>0,sharedMetres,pedestrianMetres,footwayMetres:r.pedestrianImprovement?.footwayMetres??null,explicitSidewalkMetres:r.pedestrianImprovement?.explicitSidewalkMetres??null,pedestrianImprovement:r.pedestrianImprovement||null,estimatedApproaches:(r.approaches||[]).filter(a=>a.estimated).map(a=>({side:a.side,distance:a.distance})),withoutConstruction};
  results.push(row);console.log(`${results.length}/60 ${bin.label} ${start.name} → ${end.name}: ${r.error||'OK'}${withoutConstruction?.success?' (without works OK)':''}`);
 }
}
const summary=bins.map(b=>{const rows=results.filter(r=>r.bin===b.label);return {bin:b.label,poolPairs:b.pool.length,total:rows.length,success:rows.filter(r=>r.success).length,errors:Object.fromEntries([...new Set(rows.filter(r=>r.error).map(r=>r.error))].map(e=>[e,rows.filter(r=>r.error===e).length]))};});
const succeeded=results.filter(r=>r.success),totals={successfulRoutes:succeeded.length,estimatedRoutes:succeeded.filter(r=>r.estimatedApproaches.length).length,pedestrianMetres:succeeded.reduce((n,r)=>n+r.pedestrianMetres,0),sharedMetres:succeeded.reduce((n,r)=>n+r.sharedMetres,0),routeMetres:succeeded.reduce((n,r)=>n+r.distance,0)};
const report={checkedAt:new Date().toISOString(),constructionFetchedAt:snapshot.fetchedAt,constructionUpdatedAt:snapshot.sourceUpdatedAt,seed,method:'Seeded stratified sample of 15 distinct unordered Taipei-address physical station pairs per straight-line distance bin; transfer-station records are deduplicated by name. Local station routing with default options and live construction snapshot; excludes official online routing path. Diagnostic rerun without construction is counterfactual only. Pedestrian metres include mapped footway, path, pedestrian, corridor and verified connectors, not a certification that all segments are sidewalks. Not a citywide or real-world accessibility rate.',stationRecords:records.length,stations:stations.length,summary,totals,results};
fs.writeFileSync(process.env.BENCHMARK_OUTPUT||'reports/metro-distance-benchmark.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(summary));
