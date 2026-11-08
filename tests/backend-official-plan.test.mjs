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

test('slow official service times out and falls back to a verified route',async()=>{
 const calls=[];let requestSignal;
 const pool={execute:async m=>{calls.push(m.type);return {result:{distance:120,geometryVerification:'pedestrian-network-v1'}}}};
 const result=await planOfficialRoute(task,snapshot,{pool,officialTimeoutMs:10,query:(_a,_b,_opts,signal)=>{requestSignal=signal;return new Promise(()=>{})}});
 assert.equal(requestSignal.aborted,true);assert.deepEqual(calls,['plan-places']);assert.equal(result.distance,120);
});
test('slow optional detour stops waiting and falls back without returning unverified geometry',async()=>{
 const calls=[],pool={execute:async m=>{calls.push(m.type);return {result:m.type==='verify-official'?{error:'OFFICIAL_ROAD_CONFLICT',detourWaypoints:[[25.005,121.505]]}:{distance:120,geometryVerification:'pedestrian-network-v1'}}}};let queries=0;
 const result=await planOfficialRoute(task,snapshot,{pool,detourBudgetMs:10,query:async()=>{if(++queries===1)return {coordinates:[[25,121.5],[25.01,121.51]]};return new Promise(()=>{})}});
 assert.deepEqual(calls,['verify-official','plan-places']);assert.equal(result.geometryVerification,'pedestrian-network-v1');assert.equal(queries,2);
});

test('immediate cancellation does not start an upstream request',async()=>{
 const abort=new AbortController();let queries=0;const promise=planOfficialRoute(task,snapshot,{signal:abort.signal,pool:{execute:async()=>assert.fail('must not calculate')},query:async()=>{queries++;return {error:'OFFICIAL_TIMEOUT'}}});
 abort.abort();await assert.rejects(promise,/CANCELLED/);await Promise.resolve();assert.equal(queries,0);
});
