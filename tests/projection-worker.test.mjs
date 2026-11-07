import test from 'node:test';
import assert from 'node:assert/strict';

test('one live worker handles over 1024 separately verified projection tasks',async()=>{
 const nodes=[],edges=[],proof={schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
 for(let i=0;i<1025;i++){
  const lat=25+Math.floor(i/80)*.002,lon=121.42+(i%80)*.003;
  nodes.push([lat,lon,0,i*2+1],[lat,lon+140/100700,0,i*2+2]);edges.push([i*2,i*2+1,140,0,[],proof]);
 }
 const graph={nodes,edges,ways:[{highway:'footway',width:2,slope:0}],officialPathEvidence:{schemaVersion:2},
  officialAreas:[{type:'Polygon',coordinates:[[[121.49,24.99],[121.51,24.99],[121.51,25.01],[121.49,25.01],[121.49,24.99]]]}],
  officialCrossingAreas:[],roadGeometries:[[[121.79,25],[121.79,25.01]]]};
 const oldFetch=globalThis.fetch,oldSelf=globalThis.self,oldPost=globalThis.postMessage,replies=[];
 try{
  globalThis.self={};globalThis.postMessage=message=>replies.push(message);
  globalThis.fetch=async url=>{
   if(String(url).includes('official-conditions'))return {ok:false};
   const body=new TextEncoder().encode(JSON.stringify(/facilities|places/.test(String(url))?[]:graph));
   return {ok:true,arrayBuffer:async()=>body.buffer};
  };
  await import('../src/route-worker.js?projection-worker-test');
  await self.onmessage({data:{type:'init',url:'https://example.test/data/graph.json'}});
  assert.equal(replies.at(-1)?.type,'ready');
  const stamp=new Date().toISOString(),construction={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]};
  let firstEpoch;
  for(let i=0;i<1025;i++){
   const a=nodes[i*2],b=nodes[i*2+1],startPlace={id:'point-1',originKind:'map',lat:a[0],lon:(a[1]+b[1])/2},endPlace={id:'point-2',originKind:'map',lat:a[0],lon:a[1]};
   await self.onmessage({data:{type:'plan-places',id:i+1,startPlace,endPlace,options:{},construction}});
   const message=replies.at(-1);assert.equal(message.type,'route');assert.equal(message.id,i+1);assert.equal(message.result.error,undefined);
   assert.equal(message.result.geometryVerification,'pedestrian-network-v1');
   if(i===0)firstEpoch=message.result.projectionEpoch;
   if(i===1024)assert.notEqual(message.result.projectionEpoch,firstEpoch);
  }
 }finally{globalThis.fetch=oldFetch;globalThis.self=oldSelf;globalThis.postMessage=oldPost;}
});
