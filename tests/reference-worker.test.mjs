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
 }finally{globalThis.fetch=oldFetch;globalThis.self=oldSelf;globalThis.postMessage=oldPost;}
});
