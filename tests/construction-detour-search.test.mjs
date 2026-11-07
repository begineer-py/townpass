import test from 'node:test';
import assert from 'node:assert/strict';
import {createConstructionDetourSearch} from '../src/construction-detour-search.mjs';
const stamp=new Date().toISOString(),snapshot={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]};
test('runs a selected construction detour in an isolated worker and keeps its original route',async()=>{
 const states=[],messages=[],originalRoute={id:'original'};let worker;
 const search=createConstructionDetourSearch({fetchSnapshot:async()=>snapshot,createWorker:()=>worker={postMessage:m=>messages.push(m),terminate(){this.terminated=true;}},onState:s=>states.push(s)});
 await search.start({startPlace:{lat:25,lon:121.5},endPlace:{lat:25,lon:121.51},options:{},url:'graph',ids:['work-1'],originalRoute,online:true});
 worker.onmessage({data:{type:'ready'}});assert.equal(messages[1].type,'avoid-construction');assert.deepEqual(messages[1].ids,['work-1']);
 worker.onmessage({data:{type:'avoid-construction',id:messages[1].id,result:{coordinates:[]}}});
 assert.equal(states.at(-1).status,'ready');assert.equal(states.at(-1).originalRoute,originalRoute);assert.equal(worker.terminated,true);
});
test('cancellation fences a late result and keeps the existing route',async()=>{
 const states=[];let worker;
 const search=createConstructionDetourSearch({fetchSnapshot:async()=>snapshot,createWorker:()=>worker={postMessage(){},terminate(){}},onState:s=>states.push(s)});
 await search.start({ids:['work-1'],originalRoute:{},online:true});const late=worker.onmessage;search.cancel();late({data:{type:'avoid-construction',id:1,result:{}}});
 assert.equal(states.at(-1).status,'idle');assert.equal(states.some(s=>s.status==='ready'),false);
});
