import test from 'node:test';
import assert from 'node:assert/strict';
import {createRouteCoalescer} from '../server/route-coalescer.mjs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const snapshot={sourceUpdatedAt:'source',fetchedAt:'fetch'};
const task=id=>({id,type:'plan-places',startPlace:{lat:25,lon:121.5},endPlace:{lat:25.01,lon:121.51},options:{avoidSteps:true}});

test('six identical route requests share one calculation and retain their IDs',async()=>{
 let calls=0,finish;const pool={execute:()=>{calls++;return new Promise(resolve=>{finish=resolve})}},coalescer=createRouteCoalescer(pool);
 const jobs=Array.from({length:6},(_,i)=>coalescer.execute(task(i),snapshot));await flush();assert.equal(calls,1);
 finish({type:'route',id:0,result:{distance:696}});const results=await Promise.all(jobs);assert.deepEqual(results.map(r=>r.id),[0,1,2,3,4,5]);assert.ok(results.every(r=>r.result.distance===696));
});
test('cancelling one caller leaves the shared calculation running for the other',async()=>{
 let finish,underlyingSignal;const pool={execute:(_m,{signal})=>{underlyingSignal=signal;return new Promise(resolve=>{finish=resolve})}},coalescer=createRouteCoalescer(pool),a=new AbortController();
 const first=coalescer.execute(task(1),snapshot,{signal:a.signal}),second=coalescer.execute(task(2),snapshot);await flush();a.abort();await assert.rejects(first,/CANCELLED/);assert.equal(underlyingSignal.aborted,false);
 finish({type:'route',id:1,result:{distance:10}});assert.equal((await second).id,2);
});
test('cancelling all callers aborts the calculation and a later retry starts fresh',async()=>{
 const calls=[];const pool={execute:(_m,{signal})=>{calls.push(signal);return new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(Error('ROUTING_CANCELLED')),{once:true});})}},coalescer=createRouteCoalescer(pool),a=new AbortController(),b=new AbortController();
 const first=coalescer.execute(task(1),snapshot,{signal:a.signal}),second=coalescer.execute(task(2),snapshot,{signal:b.signal});await flush();a.abort();b.abort();await assert.rejects(first,/CANCELLED/);await assert.rejects(second,/CANCELLED/);assert.equal(calls[0].aborted,true);
 const c=new AbortController(),retry=coalescer.execute(task(3),snapshot,{signal:c.signal});await flush();assert.equal(calls.length,2);c.abort();await assert.rejects(retry,/CANCELLED/);
});
test('different options, endpoints or construction snapshots are never merged',async()=>{
 let calls=0;const pool={execute:async m=>{calls++;return {type:'route',id:m.id,result:{distance:10}}}},coalescer=createRouteCoalescer(pool);
 await Promise.all([coalescer.execute(task(1),snapshot),coalescer.execute({...task(2),options:{avoidSteps:false}},snapshot),coalescer.execute({...task(3),endPlace:{lat:25.02,lon:121.51}},snapshot),coalescer.execute(task(4),{...snapshot,fetchedAt:'later'})]);assert.equal(calls,4);
});
test('failed shared computation is discarded and can be retried',async()=>{
 let calls=0;const coalescer=createRouteCoalescer({execute:async m=>{if(++calls===1)throw Error('failed');return {type:'route',id:m.id,result:{distance:10}}}});
 await assert.rejects(coalescer.execute(task(1),snapshot),/failed/);assert.equal((await coalescer.execute(task(2),snapshot)).id,2);assert.equal(calls,2);
});
