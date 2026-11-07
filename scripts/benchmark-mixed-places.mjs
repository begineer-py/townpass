import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {metres} from '../src/routing.mjs';
import {createLocalRouteVerifier} from '../src/local-route-verifier.mjs';
import {createVerifiedRouter,planImprovedPlaces} from '../src/pedestrian-planning.mjs';
import {createConstructionChecker} from '../src/construction.mjs';

export const MIXED_SEED=20261110;
export const DISTANCES=[{label:'0.5–1 km',min:500,max:1000},{label:'1–2 km',min:1000,max:2000},{label:'2–4 km',min:2000,max:4000},{label:'4–8 km',min:4000,max:8000}];
export const TYPES=['health','place','park','rest','toilet'];
const inExtent=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&p.lat>24.94&&p.lat<25.24&&p.lon>121.42&&p.lon<121.69&&p.id&&p.name;
const category=p=>p.kind==='public-toilet'||p.kind==='toilet'||String(p.kind)==='9'?'toilet':p.kind;
const shuffle=(array,random)=>{const a=[...array];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;};
const byId=(a,b)=>String(a.id).localeCompare(String(b.id),'en');
export function sampleMixed(stationRecords,places,facilities,{seed=MIXED_SEED,perCategory=2,maxPlacesPerType=100}={}){
 if(!Number.isSafeInteger(seed)||seed<0||seed>0xffffffff)throw Error('Invalid seed');
 let state=seed;const random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/2**32);
 const stationsByName=new Map();
 for(const p of stationRecords.filter(p=>inExtent(p)&&String(p.kind)==='20'&&/臺北市|台北市/.test(p.address||'')).sort(byId)){
  const k=p.name.replace(/臺/g,'台').replace(/[（(][^）)]*[）)]/g,'').trim();if(!stationsByName.has(k))stationsByName.set(k,p);
 }
 const stations=[...stationsByName.values()];
 const all=[...places,...facilities].filter(inExtent).sort(byId),groups=new Map();
 for(const type of TYPES){
  const seen=new Set(),pool=[];
  for(const p of all){if(category(p)!==type)continue;const key=`${p.id}:${p.lat}:${p.lon}`;if(seen.has(key))continue;seen.add(key);pool.push(p);}
  groups.set(type,{available:pool.length,places:shuffle(pool,random).slice(0,maxPlacesPerType)});
 }
 const cases=[],availability=[],usedPlaces=new Set();
 for(const bin of DISTANCES)for(const type of TYPES){
  const pool=[];for(const p of groups.get(type).places)for(const s of stations){
   const d=metres([s.lat,s.lon],[p.lat,p.lon]);if(d>=bin.min&&d<bin.max)pool.push({station:s,place:p,distance:Math.round(d)});
  }
  const shuffled=shuffle(pool,random),selected=[];
  for(const row of shuffled){if(usedPlaces.has(row.place.id))continue;usedPlaces.add(row.place.id);selected.push(row);if(selected.length===perCategory)break;}
  if(selected.length<perCategory)throw Error(`Insufficient distinct places: ${bin.label} / ${type}`);
  availability.push({bin:bin.label,type,poolPairs:pool.length});
  for(let i=0;i<perCategory;i++){const {station,place,distance}=selected[i],stationFirst=(i%2===0);cases.push({bin:bin.label,type,start:stationFirst?station:place,end:stationFirst?place:station,straightMetres:distance});}
 }
 return {cases,stationCount:stations.length,placePools:Object.fromEntries([...groups].map(([key,value])=>[key,{available:value.available,sampled:value.places.length}])),availability};
}

export async function main(){
 const seed=Number(process.env.BENCHMARK_SEED||MIXED_SEED),load=n=>JSON.parse(gunzipSync(fs.readFileSync(`public/data/${n}.json.gz`)));
 const graph=load('graph'),places=load('places'),facilities=load('facilities');
 const sample=sampleMixed(facilities,places,facilities,{seed});
 let snapshot;if(process.env.BENCHMARK_SNAPSHOT)snapshot=JSON.parse(fs.readFileSync(process.env.BENCHMARK_SNAPSHOT,'utf8'));
 else{const response=await fetch(process.env.BENCHMARK_URL||'http://127.0.0.1:5173/api/construction');if(!response.ok)throw Error(`Construction HTTP ${response.status}`);snapshot=await response.json();}
 const checker=createConstructionChecker(snapshot),verifyLocal=createLocalRouteVerifier(graph,facilities,places),router=createVerifiedRouter(graph,verifyLocal),results=[];
 for(const [index,c] of sample.cases.entries()){
  const r=planImprovedPlaces(c.start,c.end,{officialOnly:false},snapshot,{graph,router,verifyLocal,facilities,checker});
  const sharedMetres=(r.tierSegments||[]).filter(s=>s.sharedRoad).reduce((n,s)=>n+s.distance,0),pedestrianMetres=(r.tierSegments||[]).filter(s=>!s.sharedRoad).reduce((n,s)=>n+s.distance,0),est=(r.approaches||[]).filter(a=>a.estimated);
  const describe=p=>({id:p.id,name:p.name,kind:p.kind,sourceId:p.sourceId||null,coordinate:[p.lat,p.lon]});
  results.push({bin:c.bin,type:c.type,start:describe(c.start),end:describe(c.end),straightMetres:c.straightMetres,success:!r.error,error:r.error||null,attemptErrors:r.attemptErrors||null,distance:r.distance??null,sharedMetres:Math.round(sharedMetres),pedestrianMetres:Math.round(pedestrianMetres),sharedPct:r.distance?Math.round(sharedMetres/r.distance*100):null,footwayMetres:r.pedestrianImprovement?.footwayMetres??null,explicitSidewalkMetres:r.pedestrianImprovement?.explicitSidewalkMetres??null,pedestrianImprovement:r.pedestrianImprovement||null,estimatedApproaches:est.map(a=>({side:a.side,distance:a.distance})),estimatedMetres:est.reduce((n,a)=>n+a.distance,0)});
  console.log(`${index+1}/${sample.cases.length} ${c.bin} ${c.type} ${c.start.name} → ${c.end.name}: ${r.error||'OK'}`);
 }
 const summary=DISTANCES.map(bin=>{const a=results.filter(r=>r.bin===bin.label),ok=a.filter(r=>r.success);return {bin:bin.label,total:a.length,success:ok.length,errors:Object.fromEntries([...new Set(a.filter(r=>r.error).map(r=>r.error))].map(e=>[e,a.filter(r=>r.error===e).length]))};});
 const ok=results.filter(r=>r.success),report={checkedAt:new Date().toISOString(),constructionFetchedAt:snapshot.fetchedAt,constructionUpdatedAt:snapshot.sourceUpdatedAt,graphSha256:createHash('sha256').update(fs.readFileSync('public/data/graph.json.gz')).digest('hex'),constructionWorksSha256:createHash('sha256').update(JSON.stringify(snapshot.works)).digest('hex'),seed,method:'Fixed-seed sample of station + public POI pairs, two per type per straight-line distance bin; sample POIs without checking graph connectivity. Bounds are a rectangle, not the Taipei administrative boundary. Local routing only; no online official route, current elevator maintenance, field verification, or citywide representativeness. Shared and estimated distances are routing output, not evidence of safe accessibility.',dataSources:['public/data/places.json.gz (OpenStreetMap)','public/data/facilities.json.gz (Taipei official / OpenStreetMap)','public/data/graph.json.gz (OSM and official geometry)','live construction snapshot'],stationCount:sample.stationCount,placePools:sample.placePools,availability:sample.availability,total:results.length,success:ok.length,sharedRoutes:ok.filter(r=>r.sharedMetres>0).length,estimatedRoutes:ok.filter(r=>r.estimatedApproaches.length>0).length,sharedMetres:ok.reduce((n,r)=>n+r.sharedMetres,0),estimatedMetres:ok.reduce((n,r)=>n+r.estimatedMetres,0),successfulDistanceMetres:ok.reduce((n,r)=>n+r.distance,0),summary,results};
 report.pedestrianMetres=ok.reduce((n,r)=>n+r.pedestrianMetres,0);
 report.method+=' Pedestrian metres include mapped footway, path, pedestrian, corridor and verified connectors; they do not certify that all segments are sidewalks.';
 fs.writeFileSync(process.env.BENCHMARK_OUTPUT||'reports/mixed-place-benchmark.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({summary,total:report.total,success:report.success,sharedRoutes:report.sharedRoutes,estimatedRoutes:report.estimatedRoutes,sharedMetres:report.sharedMetres,pedestrianMetres:report.pedestrianMetres,estimatedMetres:report.estimatedMetres,successfulDistanceMetres:report.successfulDistanceMetres}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
