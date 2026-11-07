import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {createRouter,metres} from '../src/routing.mjs';
import {createLocalRouteVerifier,planPlaces} from '../src/local-route-verifier.mjs';
import {createConstructionChecker} from '../src/construction.mjs';

// Fixed exploratory sample, intentionally not described as random or citywide.
// Each run uses the same construction snapshot for baseline and intervention.
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const files=Object.fromEntries(['graph','facilities','places'].map(n=>[n,fs.readFileSync(`public/data/${n}.json.gz`)]));
const parse=n=>JSON.parse(gunzipSync(files[n]));
const facilities=parse('facilities'),places=parse('places');
const stations=facilities.filter(p=>p.kind==='20'&&/臺北市|台北市/.test(p.address||''));
const indexBytes=fs.readFileSync('public/data/address-index.json');
const roads=JSON.parse(indexBytes).filter(x=>/臺北市|台北市/.test(x.street));
const cases=[],addressHashes={};
for(const road of roads){
 const bytes=fs.readFileSync(`public/data/addresses/${road.file}.json`);
 const rows=JSON.parse(bytes);
 for(const a of rows){
  if(!Array.isArray(a)||!Number.isFinite(a[1])||!Number.isFinite(a[2]))continue;
  const closest=stations.map(x=>({place:x,distance:metres([x.lat,x.lon],[a[1],a[2]])}))
   .filter(x=>x.distance>500&&x.distance<2000).sort((x,y)=>x.distance-y.distance||String(x.place.id).localeCompare(String(y.place.id),'en'))[0];
  if(!closest)continue;
  const point={name:a[0],lat:a[1],lon:a[2],id:`address-${a[1]}-${a[2]}-0`,kind:'place',sourceId:'osm'};
  cases.push({street:road.street,address:point,station:closest.place,straightMetres:Math.round(closest.distance)});
  addressHashes[road.file]=digest(bytes);break;
 }
 if(cases.length===10)break;
}
if(cases.length!==10)throw Error('Not enough address cases');
const response=await fetch(process.env.BENCHMARK_URL||'http://127.0.0.1:5173/api/construction');
if(!response.ok)throw Error(`Construction HTTP ${response.status}`);
const snapshotBytes=Buffer.from(await response.arrayBuffer()),snapshot=JSON.parse(snapshotBytes),checker=createConstructionChecker(snapshot);
function setup(){const graph=parse('graph');return {router:createRouter(graph),verifyLocal:createLocalRouteVerifier(graph,facilities,places),facilities,checker};}
const baseline=setup(),selected=setup(),results=[];
const describe=r=>{
 const segments=r.tierSegments||[],shared=segments.filter(s=>s.sharedRoad).reduce((n,s)=>n+s.distance,0),pedestrian=segments.filter(s=>!s.sharedRoad).reduce((n,s)=>n+s.distance,0),estimated=(r.approaches||[]).filter(x=>x.estimated);
 return {success:!r.error,error:r.error||null,distance:r.distance??null,sharedMetres:Math.round(shared),pedestrianMetres:Math.round(pedestrian),estimatedApproaches:estimated.map(x=>({side:x.side,distance:x.distance,originKind:x.originKind??null}))};
};
for(const [i,c] of cases.entries()){
 const old=planPlaces(c.address,c.station,{},snapshot,baseline);
 const next=planPlaces({...c.address,selectionKind:'user'},c.station,{},snapshot,selected);
 results.push({street:c.street,address:{id:c.address.id,name:c.address.name,coordinate:[c.address.lat,c.address.lon]},station:{id:c.station.id,name:c.station.name,coordinate:[c.station.lat,c.station.lon]},straightMetres:c.straightMetres,baseline:describe(old),selected:describe(next)});
 console.log(`${i+1}/${cases.length} ${old.error||'OK'} → ${next.error||'OK'}`);
}
const sums=key=>{const r=results.map(x=>x[key]),ok=r.filter(x=>x.success);return {total:r.length,success:ok.length,estimatedRoutes:ok.filter(x=>x.estimatedApproaches.length).length,sharedMetres:ok.reduce((n,x)=>n+x.sharedMetres,0),pedestrianMetres:ok.reduce((n,x)=>n+x.pedestrianMetres,0)};};
const report={checkedAt:new Date().toISOString(),method:'Exploratory deterministic sample: first eligible address on each of the first 10 Taipei street records; closest station 500–2000m away. Address selected as the start, one direction; same live construction snapshot in both passes and fresh router graph per pass. Not random, not representative, not UI or physical-accessibility verification.',sources:{graphSha256:digest(files.graph),facilitiesSha256:digest(files.facilities),placesSha256:digest(files.places),addressIndexSha256:digest(indexBytes),addressFilesSha256:addressHashes,constructionSnapshotSha256:digest(snapshotBytes),constructionUpdatedAt:snapshot.sourceUpdatedAt,constructionFetchedAt:snapshot.fetchedAt},baseline:sums('baseline'),selected:sums('selected'),results};
fs.writeFileSync(process.env.BENCHMARK_OUTPUT||'reports/selected-address-benchmark.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({baseline:report.baseline,selected:report.selected,constructionUpdatedAt:snapshot.sourceUpdatedAt}));
