import test from 'node:test';import assert from 'node:assert/strict';import {createHash,webcrypto} from 'node:crypto';import proj4 from 'proj4';
const twd='+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs';
const ll=p=>{const [lon,lat]=proj4(twd,'EPSG:4326',p);return [lat,lon];};
test('reference worker independently screens every candidate from the source asset',async()=>{
 const a=[303000,2778000],b=[303100,2778000],start=ll(a),end=ll(b),stamp=new Date().toISOString();
 const area={type:'Polygon',coordinates:[[[121.52,25.10],[121.54,25.10],[121.54,25.12],[121.52,25.12],[121.52,25.10]]]};
 const graph={officialPathEvidence:{schemaVersion:2},officialAreas:[area],officialCrossingAreas:[],roadGeometries:[[[121.79,25],[121.79,25.01]]],nodes:[],ways:[],edges:[]};
 const asset={schemaVersion:1,source:'official-passageway',sourceHash:'a'.repeat(64),crs:'EPSG:3826',parts:[{qgsFid:'1',partIndex:0,bounds:[a[0],a[1],b[0],b[1]],coordinates:[a,b]}]};
 const assetBytes=new TextEncoder().encode(JSON.stringify(asset)),digest=createHash('sha256').update(assetBytes).digest('hex'),manifest={schemaVersion:1,sourceHash:asset.sourceHash,parts:1,assetSha256:digest,jsonSha256:digest};
 const oldFetch=globalThis.fetch,oldSelf=globalThis.self,oldPost=globalThis.postMessage,replies=[];
 try{
  if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
  globalThis.self={};globalThis.postMessage=m=>replies.push(m);
  globalThis.fetch=async url=>{const u=String(url);if(u.includes('official-conditions'))return {ok:false};if(u.includes('official-sidewalk-reference.meta'))return {ok:true,json:async()=>manifest};const body=u.includes('official-sidewalk-reference')?asset:/facilities|places/.test(u)?[]:graph;return {ok:true,arrayBuffer:async()=>new TextEncoder().encode(JSON.stringify(body)).buffer};};
  await import('../src/route-worker.js?reference-worker-test');
  await self.onmessage({data:{type:'init',url:'https://example.test/data/graph.json'}});assert.equal(replies.at(-1).type,'ready');
  const construction={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]};
  await self.onmessage({data:{type:'reference-route',id:12,start,end,construction,options:{}}});
  const result=replies.at(-1);assert.equal(result.type,'reference-route');assert.equal(result.id,12);assert.equal(result.result.error,undefined);
  assert.equal(result.result.kind,'official-passageway-comparison');const route=result.result.candidates[0].route;assert.equal(route.navigationAllowed,true);assert.equal(route.geometryVerification,undefined);
  assert.ok(route.segments.some(s=>s.kind==='official-line'&&s.qgsFid==='1'));assert.equal(result.result.constructionSourceUpdatedAt,stamp);
  const candidate=result.result.candidates[0];assert.ok(Math.abs(candidate.coverage.generalSidewalkMetres-route.distanceMetres)<.01);assert.ok(Math.abs(candidate.scoreBreakdown.sidewalk-40)<.01);assert.equal(candidate.scoreBreakdown.officialArea,undefined);
 }finally{globalThis.fetch=oldFetch;globalThis.self=oldSelf;globalThis.postMessage=oldPost;}
});
async function runBoundedScenario(parts,id){
 const a=[303000,2778000],b=[303100,2778000],start=ll(a),end=ll(b),stamp=new Date().toISOString();
 const area={type:'Polygon',coordinates:[[[121.52,25.10],[121.54,25.10],[121.54,25.12],[121.52,25.12],[121.52,25.10]]]};
 const graph={officialPathEvidence:{schemaVersion:2},officialAreas:[area],officialCrossingAreas:[],roadGeometries:[[[121.79,25],[121.79,25.01]]],nodes:[],ways:[],edges:[]};
 const asset={schemaVersion:1,source:'official-passageway',sourceHash:'a'.repeat(64),crs:'EPSG:3826',parts};
 const bytes=new TextEncoder().encode(JSON.stringify(asset)),digest=createHash('sha256').update(bytes).digest('hex'),manifest={schemaVersion:1,sourceHash:asset.sourceHash,parts:parts.length,assetSha256:digest,jsonSha256:digest};
 const oldFetch=globalThis.fetch,oldSelf=globalThis.self,oldPost=globalThis.postMessage,replies=[];
 try{
  if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
  globalThis.self={};globalThis.postMessage=m=>replies.push(m);
  globalThis.fetch=async url=>{const u=String(url);if(u.includes('official-conditions'))return {ok:false};if(u.includes('official-sidewalk-reference.meta'))return {ok:true,json:async()=>manifest};const body=u.includes('official-sidewalk-reference')?asset:/facilities|places/.test(u)?[]:graph;return {ok:true,arrayBuffer:async()=>new TextEncoder().encode(JSON.stringify(body)).buffer};};
  await import(`../src/route-worker.js?bounded-reference-${id}`);
  await self.onmessage({data:{type:'init',url:'https://example.test/data/graph.json'}});assert.equal(replies.at(-1).type,'ready');
  await self.onmessage({data:{type:'reference-route',id,start,end,construction:{schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]},options:{}}});
  return replies.at(-1).result;
 }finally{globalThis.fetch=oldFetch;globalThis.self=oldSelf;globalThis.postMessage=oldPost;}
}
const part=(i,y)=>({qgsFid:String(i),partIndex:0,bounds:[303000,y,303100,y],coordinates:[[303000,y],[303100,y]]});
test('worker retries a dense 1 km corridor at 500m and returns screened results marked incomplete',async()=>{
 const parts=[part(1,2778000),...Array.from({length:10000},(_,i)=>part(i+2,2778700))];
 const result=await runBoundedScenario(parts,101);assert.equal(result.error,undefined);assert.equal(result.marginMetres,500);assert.equal(result.status,'incomplete');
 assert.ok(result.candidates.length);assert.equal(result.candidates[0].route.verification,'official-source-screened-v1');assert.equal(result.candidates[0].route.navigationAllowed,true);
});
test('worker tries 250m only after both wider corridors hit a limit',async()=>{
 const parts=[part(1,2778000),...Array.from({length:10000},(_,i)=>part(i+2,2778350)),...Array.from({length:10000},(_,i)=>part(i+10002,2778700))];
 const result=await runBoundedScenario(parts,102);assert.equal(result.error,undefined);assert.equal(result.marginMetres,250);assert.equal(result.status,'incomplete');assert.ok(result.candidates.length);
});
test('a narrower no-connection result after a wider limit remains a search limit',async()=>{
 const parts=Array.from({length:10001},(_,i)=>part(i+1,2778700));
 const result=await runBoundedScenario(parts,103);assert.equal(result.error,'PROVISIONAL_SEARCH_LIMIT');assert.equal(result.narrowResult,'NO_PROVISIONAL_CONNECTION');
});
test('a normal no-connection result without a limit is not changed to a limit',async()=>{
 const result=await runBoundedScenario([part(1,2778700)],104);assert.equal(result.error,'NO_PROVISIONAL_CONNECTION');
});
