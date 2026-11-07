import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';

// Exercise the actual worker protocol, not a straight-line approximation.
const baseline=JSON.parse(fs.readFileSync('reports/metro-sidewalk-approach-comparison.json'));
const failures=baseline.results.filter(r=>r.optimized?.error==='NO_ROUTE');
if(failures.length!==13)throw Error('Expected the 13 fixed NO_ROUTE station pairs');
const files=Object.fromEntries(['graph','facilities','places'].map(n=>[n,fs.readFileSync(`public/data/${n}.json.gz`)]));
const facilities=JSON.parse(gunzipSync(files.facilities));
const response=await fetch(process.env.BENCHMARK_URL||'http://127.0.0.1:5173/api/construction');
if(!response.ok)throw Error(`Construction HTTP ${response.status}`);const snapshot=await response.json();
const originalFetch=globalThis.fetch,replies=[];
globalThis.fetch=async input=>{const name=String(input).match(/(graph|facilities|places)\.json\.gz/)?.[1];if(!name)throw Error('Unexpected fetch');const data=files[name];return {ok:true,arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)};};
globalThis.self={};globalThis.postMessage=message=>replies.push(message);
await import('../src/route-worker.js');await self.onmessage({data:{type:'init',url:'https://local.test/data/graph.json.gz'}});
if(!replies.some(r=>r.type==='ready'))throw Error('Worker initialisation failed');
const rows=[];
for(const [i,pair] of failures.entries()){
 const start=facilities.find(p=>p.id===pair.startId),end=facilities.find(p=>p.id===pair.endId);if(!start||!end)throw Error('Missing station');
 await self.onmessage({data:{type:'plan-places',id:i+1,startPlace:start,endPlace:end,options:{officialOnly:false},construction:snapshot}});
 const result=replies.find(r=>r.id===i+1)?.result;if(!result)throw Error(`Missing result ${i+1}`);
 const segments=result.partialRoute?.segments||[];rows.push({start:start.name,end:end.name,error:result.error||null,complete:!result.error,partial:segments.length>0,sides:segments.map(s=>({side:s.side,distance:s.distance,coordinates:s.coordinates.length,estimated:s.approaches?.some(a=>a.estimated)||false})),gap:result.partialRoute?.gap||null});
 console.log(`${i+1}/${failures.length} ${start.name} → ${end.name}: ${result.error||'COMPLETE'}; partial ${segments.length}`);
}
globalThis.fetch=originalFetch;
const report={checkedAt:new Date().toISOString(),constructionUpdatedAt:snapshot.sourceUpdatedAt,method:'Thirteen fixed previously unsuccessful station pairs, actual local worker with current route and fresh construction. Partial means individually verified graph sections, not full arrival; gap is not a route. Results not citywide or field validation.',total:rows.length,complete:rows.filter(r=>r.complete).length,partial:rows.filter(r=>r.partial).length,twoSides:rows.filter(r=>r.sides.length===2).length,rows};
fs.writeFileSync('reports/partial-stations-test.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({total:report.total,complete:report.complete,partial:report.partial,twoSides:report.twoSides}));
