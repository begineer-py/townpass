import test from 'node:test';
import assert from 'node:assert/strict';
import {planOfficialRoute} from '../server/official-plan.mjs';
const task={id:1,start:[25,121.5],end:[25.01,121.51],startPlace:{lat:25,lon:121.5},endPlace:{lat:25.01,lon:121.51},options:{}};
const snapshot={sourceUpdatedAt:'test'};
test('official route is verified on the backend before publication',async()=>{
 const calls=[],pool={execute:async m=>{calls.push(m);return {result:{geometryVerification:'pedestrian-network-v1',distance:100}}}};
 const result=await planOfficialRoute(task,snapshot,{pool,query:async()=>({coordinates:[[25,121.5],[25.01,121.51]]})});
 assert.equal(calls[0].type,'verify-official');assert.equal(calls[0].construction,snapshot);assert.equal(result.distance,100);
});
test('official failure falls back to the verified backend pedestrian planner',async()=>{
 const calls=[],pool={execute:async m=>{calls.push(m);return {result:{distance:120}}}};
 const result=await planOfficialRoute(task,snapshot,{pool,query:async()=>({error:'OFFICIAL_UNAVAILABLE'})});
 assert.equal(calls[0].type,'plan-places');assert.equal(result.distance,120);
});
test('backend tests detours then returns verified route',async()=>{
 let verified=0,queried=0;const pool={execute:async m=>({result:++verified===1?{error:'OFFICIAL_ROAD_CONFLICT',detourWaypoints:[[25.005,121.505]]}:{distance:130}})};
 const result=await planOfficialRoute(task,snapshot,{pool,query:async()=>{queried++;return {coordinates:[[25,121.5],[25.01,121.51]]}}});
 assert.equal(queried,2);assert.equal(verified,2);assert.equal(result.distance,130);assert.equal(result.alternativeAttempts,1);
});
test('cancelled official request never starts a fallback',async()=>{
 const abort=new AbortController();let called=false;const promise=planOfficialRoute(task,snapshot,{signal:abort.signal,pool:{execute:async()=>{called=true}},query:async()=>{abort.abort();return {error:'OFFICIAL_TIMEOUT'}}});
 await assert.rejects(promise,/CANCELLED/);assert.equal(called,false);
});
