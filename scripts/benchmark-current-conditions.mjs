import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';

// Fixed station pairs, exercised through the real worker message handler.
const baseline=JSON.parse(fs.readFileSync('reports/metro-sidewalk-approach-comparison.json'));
if(baseline.results?.length!==60)throw Error('Expected the fixed 60 station pairs');
const files=Object.fromEntries(['graph','facilities','places','official-conditions'].map(n=>[n,fs.readFileSync(`public/data/${n}.json.gz`)]));
const facilities=JSON.parse(gunzipSync(files.facilities));
const response=await fetch(process.env.BENCHMARK_URL||'http://127.0.0.1:5173/api/construction');
if(!response.ok)throw Error(`Construction HTTP ${response.status}`);const snapshot=await response.json();
const originalFetch=globalThis.fetch,replies=[];
globalThis.fetch=async input=>{const name=String(input).match(/(graph|facilities|places|official-conditions)\.json\.gz/)?.[1];if(!name)throw Error('Unexpected fetch');const data=files[name];return {ok:true,arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)};};
globalThis.self={};globalThis.postMessage=message=>replies.push(message);
await import('../src/route-worker.js');await self.onmessage({data:{type:'init',url:'https://local.test/data/graph.json.gz'}});
if(!replies.some(r=>r.type==='ready'))throw Error('Worker initialisation failed');
const rows=[],output=process.env.BENCHMARK_OUTPUT||'reports/multiple-routes-stations.json';
for(const [i,pair] of baseline.results.entries()){
 const start=facilities.find(p=>p.id===pair.startId),end=facilities.find(p=>p.id===pair.endId);if(!start||!end)throw Error('Missing station');
 const begin=Date.now();await self.onmessage({data:{type:'plan-places',id:i+1,startPlace:start,endPlace:end,options:{officialOnly:false},construction:snapshot}});
 const result=replies.find(r=>r.id===i+1)?.result;if(!result)throw Error(`Missing result ${i+1}`);
 if(result.error==='CONSTRUCTION_UNAVAILABLE')throw Error('Construction snapshot expired or unavailable');
 const list=result.routeCandidates?.candidates||[],selected=list.find(c=>c.id===result.selectedCandidateId);
 rows.push({start:start.name,end:end.name,bin:pair.bin,error:result.error||null,complete:!result.error,partial:!!result.partialRoute,elapsedMs:Date.now()-begin,candidateCount:list.length,searchStatus:result.routeCandidates?.status||null,selected:selected?{score:selected.score,...selected.metrics}:null,candidates:list.map(c=>({id:c.id,score:c.score,metrics:c.metrics,improvement:c.improvement||null}))});
 fs.writeFileSync(output+'.partial',JSON.stringify({status:'running',rows}));
 console.log(`${i+1}/60 ${start.name} → ${end.name}: ${result.error||'OK'}, candidates ${list.length}`);
}
globalThis.fetch=originalFetch;
const ok=rows.filter(r=>r.complete),hash=b=>createHash('sha256').update(b).digest('hex');
const report={checkedAt:new Date().toISOString(),constructionUpdatedAt:snapshot.sourceUpdatedAt,constructionWorksSha256:hash(JSON.stringify(snapshot.works)),graphSha256:hash(files.graph),method:'Fixed 60 station pairs through local worker and one fresh construction snapshot. Multiple candidates are independently verified and geometrically distinct under bounded search; partial results are not complete arrivals. Not a citywide or real-world accessibility rate.',total:rows.length,complete:ok.length,partial:rows.filter(r=>r.partial&&!r.complete).length,multiple:ok.filter(r=>r.candidateCount>1).length,rows};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');fs.unlinkSync(output+'.partial');console.log(JSON.stringify({total:report.total,complete:report.complete,partial:report.partial,multiple:report.multiple}));

