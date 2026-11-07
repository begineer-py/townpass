import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createOfficialConditionIndex} from '../src/official-conditions.mjs';
import {createRouter} from '../src/routing.mjs';

const node=(x,y)=>[25+y/111195,121.5+x/100700,0];
const dataset=points=>({schemaVersion:1,fetchedAt:'2026-11-08T00:00:00Z',source:'official',points});
const point=(id,x,y,type='missing_noCurbSlope')=>({id,type,lat:node(x,y)[0],lon:node(x,y)[1],activity:null});
test('returns only nearby observations and de-duplicates across adjacent segments',()=>{
 const index=createOfficialConditionIndex(dataset([point('1',50,1),point('2',70,5,'missing_crosswalkNoRamp')]));
 const result=index.find([node(0,0),node(50,0),node(100,0)],2);
 assert.deepEqual(result.map(p=>p.id),['1']);assert.ok(result[0].distanceMetres<2);
 assert.match(result[0].label,/淨寬不足/);
});
test('rejects malformed, unknown and duplicate observations',()=>{
 assert.throws(()=>createOfficialConditionIndex(dataset([point('1',1,1),point('1',2,2)])));
 assert.throws(()=>createOfficialConditionIndex(dataset([point('1',1,1,'unexpected')])));
 assert.throws(()=>createOfficialConditionIndex({schemaVersion:1,points:[]}));
});
test('a nearby official condition adds a preference cost without deleting the edge',()=>{
 const nodes=[node(0,0),node(200,0),node(0,100),node(200,100)];
 const ways=[{name:'人行道',highway:'footway',footway:'sidewalk',width:1.5,slope:0,surface:'paved'}];
 const proof={schemaVersion:2,coverage:1,maxUncoveredMetres:0,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
 const edges=[[0,1,200,0,[],proof],[0,2,100,0,[],proof],[2,3,200,0,[],proof],[3,1,100,0,[],proof]];
 const make=()=>({nodes:nodes.map(n=>n.slice()),ways,edges:edges.map(e=>e.slice()),officialPathEvidence:{schemaVersion:2},roadGeometries:[],officialCrossingAreas:[]});
 const options={approachAllowed:(a,b)=>a[0]===b[0]&&a[1]===b[1]};
 const plain=make(),initial=createRouter(plain)(nodes[0],nodes[1],options);
 assert.equal(initial.error,undefined);assert.equal(initial.distance,200);
 const updated=make();updated.officialConditionIndex=createOfficialConditionIndex(dataset([point('1',50,0),point('2',100,0),point('3',150,0)]));
 const routed=createRouter(updated)(nodes[0],nodes[1],options);
 assert.equal(routed.error,undefined);assert.equal(routed.distance,400);assert.equal(routed.costBreakdown.officialCondition,0);
});
test('official snapshot contains both returned groups and finds the Tianmu example',()=>{
 const input=JSON.parse(gunzipSync(fs.readFileSync(new URL('../public/data/official-conditions.json.gz',import.meta.url))));
 assert.equal(input.points.length,Object.values(input.counts).reduce((a,b)=>a+b,0));
 assert.ok(input.counts.missing_noCurbSlope>0);assert.ok(input.counts.missing_crosswalkNoRamp>0);
 const route=[[25.1142927,121.5302025],[25.1147493,121.5304943],[25.1153202,121.5308518],[25.1158451,121.5311739],[25.1162238,121.5314126],[25.1163832,121.5315051],[25.1167866,121.5317555],[25.1168594,121.5317821]];
 const result=createOfficialConditionIndex(input).find(route,10);
 assert.ok(result.some(p=>p.type==='missing_noCurbSlope'));
 assert.ok(result.every(p=>p.distanceMetres<=10));
});
test('worker loads observations and returns nearby markers with a route',async()=>{
 const a=node(0,0),b=node(100,0),area={type:'Polygon',coordinates:[[[121.49,24.99],[121.51,24.99],[121.51,25.01],[121.49,25.01],[121.49,24.99]]]};
 const proof={schemaVersion:2,coverage:1,maxUncoveredMetres:0,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
 const graph={officialPathEvidence:{schemaVersion:2},officialAreas:[area],officialCrossingAreas:[],roadGeometries:[[[121.52,25],[121.52,25.01]]],nodes:[a,b],ways:[{name:'人行道',highway:'footway',width:1.5,slope:0}],edges:[[0,1,100,0,[],proof]]};
 const snapshot=dataset([point('mark',50,1)]),oldFetch=globalThis.fetch,oldSelf=globalThis.self,oldPost=globalThis.postMessage,replies=[];
 try{
  globalThis.self={};globalThis.postMessage=x=>replies.push(x);
  globalThis.fetch=async url=>({ok:true,arrayBuffer:async()=>new TextEncoder().encode(JSON.stringify(String(url).includes('official-conditions')?snapshot:/facilities|places/.test(String(url))?[]:graph)).buffer});
  await import('../src/route-worker.js?official-condition-test');
  await self.onmessage({data:{type:'init',url:'https://example.test/graph.json'}});
  const stamp=new Date().toISOString(),construction={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]};
  await self.onmessage({data:{type:'plan-places',id:101,startPlace:{lat:a[0],lon:a[1]},endPlace:{lat:b[0],lon:b[1]},options:{},construction}});
  const result=replies.find(r=>r.id===101)?.result;
  assert.equal(result.error,undefined);assert.equal(result.officialConditions.status,'available');assert.equal(result.officialConditions.points[0].id,'mark');
  assert.ok(result.routeCandidates.candidates.some(c=>c.metrics.officialConditionCount===1));
 }finally{globalThis.fetch=oldFetch;globalThis.self=oldSelf;globalThis.postMessage=oldPost;}
});
test('unavailable source is reported as unavailable rather than zero observations',async()=>{
 const a=node(0,0),b=node(100,0),area={type:'Polygon',coordinates:[[[121.49,24.99],[121.51,24.99],[121.51,25.01],[121.49,25.01],[121.49,24.99]]]};
 const proof={schemaVersion:2,coverage:1,maxUncoveredMetres:0,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
 const graph={officialPathEvidence:{schemaVersion:2},officialAreas:[area],officialCrossingAreas:[],roadGeometries:[[[121.52,25],[121.52,25.01]]],nodes:[a,b],ways:[{name:'人行道',highway:'footway',width:1.5,slope:0}],edges:[[0,1,100,0,[],proof]]};
 const oldFetch=globalThis.fetch,oldSelf=globalThis.self,oldPost=globalThis.postMessage,replies=[];
 try{
  globalThis.self={};globalThis.postMessage=x=>replies.push(x);
  globalThis.fetch=async url=>String(url).includes('official-conditions')?{ok:false}:({ok:true,arrayBuffer:async()=>new TextEncoder().encode(JSON.stringify(/facilities|places/.test(String(url))?[]:graph)).buffer});
  await import('../src/route-worker.js?official-condition-unavailable-test');
  await self.onmessage({data:{type:'init',url:'https://example.test/graph.json'}});
  const stamp=new Date().toISOString(),construction={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]};
  await self.onmessage({data:{type:'plan-places',id:102,startPlace:{lat:a[0],lon:a[1]},endPlace:{lat:b[0],lon:b[1]},options:{},construction}});
  const result=replies.find(r=>r.id===102)?.result;
  assert.equal(result.error,undefined);assert.equal(result.officialConditions.status,'unavailable');
  assert.ok(result.routeCandidates.candidates.every(c=>c.metrics.officialConditionCount===null));
 }finally{globalThis.fetch=oldFetch;globalThis.self=oldSelf;globalThis.postMessage=oldPost;}
});
