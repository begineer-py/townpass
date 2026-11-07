import test from 'node:test';
import assert from 'node:assert/strict';

test('a blocked via leg returns construction details instead of a diagnostic route',async()=>{
 const points=[[25,121.5],[25,121.501],[25,121.502]];
 const proof={schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
 const area={type:'Polygon',coordinates:[[[121.49,24.99],[121.51,24.99],[121.51,25.01],[121.49,25.01],[121.49,24.99]]]};
 const graph={officialPathEvidence:{schemaVersion:2},officialAreas:[area],officialCrossingAreas:[],roadGeometries:[[[121.51,25],[121.51,25.01]]],nodes:points.map(p=>[...p,0]),ways:[{name:'人行路',highway:'footway',width:2,slope:0}],edges:[[0,1,100,0,[],proof],[1,2,100,0,[],proof]]};
 const oldFetch=globalThis.fetch,oldSelf=globalThis.self,oldPost=globalThis.postMessage;
 const replies=[];
 try{
  globalThis.self={};globalThis.postMessage=message=>replies.push(message);
  globalThis.fetch=async url=>({ok:true,arrayBuffer:async()=>new TextEncoder().encode(JSON.stringify(/facilities|places/.test(String(url))?[]:graph)).buffer});
  await import('../src/route-worker.js');
  await self.onmessage({data:{type:'init',url:'https://example.test/graph.json'}});
  const now=new Date(),stamp=now.toISOString(),local=new Date(now.getTime()+8*3600000);
  const day=`${local.getUTCFullYear()-1911}/${local.getUTCMonth()+1}/${local.getUTCDate()}`;
  const construction={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[{id:'closure',start:day,end:day,hours:'24小時施工',impact:'blocked',geometries:[{type:'Point',coordinates:[[25,121.5015]]}]}]};
  await self.onmessage({data:{type:'route',id:42,start:points[0],via:points[1],end:points[2],options:{},construction}});
  const result=replies.find(m=>m.id===42)?.result;
  assert.equal(result.error,'CONSTRUCTION_BLOCKED');
  assert.equal(result.coordinates,undefined);
  assert.deepEqual(result.construction.blocked.map(w=>w.id),['closure']);
 }finally{globalThis.fetch=oldFetch;globalThis.self=oldSelf;globalThis.postMessage=oldPost;}
});

test('worker loads registered POIs before planning estimated approaches',async()=>{
 const a=[25,121.5],b=[25,121.501],p=[25+30/111195,121.5],poi={id:'poi',kind:'park',name:'公園',lat:p[0],lon:p[1]};
 const proof={schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
 const area={type:'Polygon',coordinates:[[[121.51,25],[121.511,25],[121.511,25.001],[121.51,25.001],[121.51,25]]]};
 const graph={officialPathEvidence:{schemaVersion:2},officialAreas:[area],officialCrossingAreas:[],roadGeometries:[[[121.51,25],[121.51,25.01]]],nodes:[[...a,0],[...b,0]],ways:[{name:'人行路',highway:'footway',width:2,slope:0}],edges:[[0,1,100,0,[],proof]]};
 const oldFetch=globalThis.fetch,oldSelf=globalThis.self,oldPost=globalThis.postMessage,replies=[];
 try{
  globalThis.self={};globalThis.postMessage=message=>replies.push(message);
  globalThis.fetch=async url=>({ok:true,arrayBuffer:async()=>new TextEncoder().encode(JSON.stringify(String(url).includes('facilities')?[]:String(url).includes('places')?[poi]:graph)).buffer});
  await import('../src/route-worker.js?poi-test');await self.onmessage({data:{type:'init',url:'https://example.test/graph.json'}});
  const stamp=new Date().toISOString(),construction={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]};
  await self.onmessage({data:{type:'plan-places',id:44,startPlace:poi,endPlace:{lat:b[0],lon:b[1]},options:{},construction}});
  const result=replies.find(m=>m.id===44)?.result;assert.equal(result.error,undefined);assert.equal(result.approaches[0].estimated,true);
 }finally{globalThis.fetch=oldFetch;globalThis.self=oldSelf;globalThis.postMessage=oldPost;}
});

test('worker offers a separately routed nearby point for an upstairs POI',async()=>{
 const a=[25,121.5],b=[25,121.501],p=[25+30/111195,121.5],poi={id:'poi',kind:'place',name:'二樓店',lat:p[0],lon:p[1],level:'1'};
 const proof={schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
 const area={type:'Polygon',coordinates:[[[121.51,25],[121.511,25],[121.511,25.001],[121.51,25.001],[121.51,25]]]};
 const graph={officialPathEvidence:{schemaVersion:2},officialAreas:[area],officialCrossingAreas:[],roadGeometries:[[[121.51,25],[121.51,25.01]]],nodes:[[...a,0,1],[...b,0,2]],ways:[{name:'人行路',highway:'footway',width:2,slope:0}],edges:[[0,1,100,0,[],proof]]};
 const oldFetch=globalThis.fetch,oldSelf=globalThis.self,oldPost=globalThis.postMessage,replies=[];
 try{
  globalThis.self={};globalThis.postMessage=message=>replies.push(message);
  globalThis.fetch=async url=>({ok:true,arrayBuffer:async()=>new TextEncoder().encode(JSON.stringify(String(url).includes('facilities')?[]:String(url).includes('places')?[poi]:graph)).buffer});
  await import('../src/route-worker.js?nearby-test');await self.onmessage({data:{type:'init',url:'https://example.test/graph.json'}});
  const stamp=new Date().toISOString(),construction={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]},endPlace={lat:b[0],lon:b[1]};
  await self.onmessage({data:{type:'plan-places',id:50,startPlace:poi,endPlace,options:{},construction}});
  assert.equal(replies.find(m=>m.id===50)?.result.error,'NO_CONNECTION');
  await self.onmessage({data:{type:'nearby-positions',id:51,startPlace:poi,endPlace,options:{},construction}});
  const result=replies.find(m=>m.id===51)?.result,candidate=result.candidates.find(c=>c.side==='start');
  assert.ok(candidate);assert.deepEqual([candidate.point.lat,candidate.point.lon],a);assert.ok(!('coordinates' in candidate));
 }finally{globalThis.fetch=oldFetch;globalThis.self=oldSelf;globalThis.postMessage=oldPost;}
});
