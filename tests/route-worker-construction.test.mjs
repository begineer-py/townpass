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
  globalThis.fetch=async url=>({ok:true,arrayBuffer:async()=>new TextEncoder().encode(JSON.stringify(String(url).includes('facilities')?[]:graph)).buffer});
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
