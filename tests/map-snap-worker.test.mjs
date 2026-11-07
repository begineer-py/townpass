import test from 'node:test';import assert from 'node:assert/strict';import {createHash,webcrypto} from 'node:crypto';import proj4 from 'proj4';
const twd='+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs';
test('main worker snaps to closest verified source without mutating routing graph',async()=>{
 const a=[25,121.5],b=[25,121.501],p=[25+20/111195,121.5005],s0=[25+18/111195,121.5002],s1=[25+18/111195,121.5008],xy=p=>proj4('EPSG:4326',twd,[p[1],p[0]]),u=xy(s0),v=xy(s1),stamp=new Date().toISOString();
 const area={type:'Polygon',coordinates:[[[121.51,25.01],[121.52,25.01],[121.52,25.02],[121.51,25.02],[121.51,25.01]]]};
 const proof={schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true},graph={officialPathEvidence:{schemaVersion:2},nodes:[[...a,0],[...b,0]],ways:[{highway:'footway',width:2,slope:0}],edges:[[0,1,100,0,[],proof]],officialAreas:[area],officialCrossingAreas:[],roadGeometries:[[[121.51,25],[121.51,25.01]]]};
 const asset={schemaVersion:1,source:'official-passageway',sourceHash:'a'.repeat(64),crs:'EPSG:3826',parts:[{qgsFid:'123',partIndex:0,bounds:[Math.min(u[0],v[0]),Math.min(u[1],v[1]),Math.max(u[0],v[0]),Math.max(u[1],v[1])],coordinates:[u,v]}]};
 const bytes=new TextEncoder().encode(JSON.stringify(asset)),digest=createHash('sha256').update(bytes).digest('hex'),manifest={schemaVersion:1,sourceHash:asset.sourceHash,parts:1,assetSha256:digest,jsonSha256:digest};
 const oldFetch=globalThis.fetch,oldSelf=globalThis.self,oldPost=globalThis.postMessage,replies=[];
 try{
  if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
  globalThis.self={};globalThis.postMessage=m=>replies.push(m);
  globalThis.fetch=async url=>{const s=String(url);if(s.includes('official-conditions'))return {ok:false};if(s.includes('official-sidewalk-reference.meta'))return {ok:true,json:async()=>manifest};const value=s.includes('official-sidewalk-reference')?asset:/facilities|places/.test(s)?[]:graph;return {ok:true,arrayBuffer:async()=>new TextEncoder().encode(JSON.stringify(value)).buffer};};
  await import('../src/route-worker.js?map-snap-test');await self.onmessage({data:{type:'init',url:'https://example.test/data/graph.json'}});assert.equal(replies.at(-1).type,'ready',JSON.stringify(replies.at(-1)));
  const construction={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]},place={id:'point-123',originKind:'map',lat:p[0],lon:p[1]};
  await self.onmessage({data:{type:'snap-map-point',id:1,point:p,place,side:'end',options:{},construction}});
  const r=replies.at(-1);assert.equal(r.type,'snap-map-point');assert.equal(r.id,1);assert.equal(r.result.source,'official-line');assert.equal(r.result.qgsFid,'123');assert.ok(r.result.distanceMetres<2.1);assert.equal(r.result.originalAccess,'unconfirmed');
  await self.onmessage({data:{type:'snap-map-point',id:2,point:p,place,side:'end',options:{},construction:{...construction,sourceUpdatedAt:'2000-01-01T00:00:00Z'}}});assert.equal(replies.at(-1).result.error,'CONSTRUCTION_UNAVAILABLE');
 }finally{globalThis.fetch=oldFetch;globalThis.self=oldSelf;globalThis.postMessage=oldPost;}
});
