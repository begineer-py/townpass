import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {requestOfficialRoute,OFFICIAL_ROUTE_URL} from '../src/official-router.mjs';
import {createOfficialRouteVerifier} from '../src/verify-official-route.mjs';
const graph=JSON.parse(gunzipSync(fs.readFileSync('public/data/graph.json.gz')));
const verify=createOfficialRouteVerifier(graph);
const pairs=JSON.parse(fs.readFileSync('reports/official-router-benchmark.json'));
const results=[]; let entranceCase;
for(const p of pairs){
 try{const candidate=await requestOfficialRoute(p.start,p.end,{},AbortSignal.timeout(25000),OFFICIAL_ROUTE_URL);
 const r=candidate.error?candidate:verify(candidate,p.start,p.end);
 if(p.name==='大安' && !candidate.error){
   const start=candidate.coordinates[0],end=candidate.coordinates.at(-1);
   const fresh=await requestOfficialRoute(start,end,{},AbortSignal.timeout(25000),OFFICIAL_ROUTE_URL);
   const checked=fresh.error?fresh:verify(fresh,start,end);
   entranceCase={name:'大安公開通道路網端點重新查詢',start,end,accepted:!checked.error,error:checked.error,distance:checked.distance,geometryVerification:checked.geometryVerification};
 }
 results.push({name:p.name,start:p.start,end:p.end,accepted:!r.error,error:r.error,geometryVerification:r.geometryVerification});
 }catch{results.push({name:p.name,accepted:false,error:'REQUEST_FAILED'});}
}
fs.writeFileSync('reports/official-geometry-audit.json',JSON.stringify({checkedAt:new Date().toISOString(),results,entranceCase},null,2));
console.log(JSON.stringify(results.map(({name,accepted,error})=>({name,accepted,error}))));
