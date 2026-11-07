import test from 'node:test';
import assert from 'node:assert/strict';
import {createRouteWorkerLifecycle} from '../src/route-worker-lifecycle.mjs';
import {createNearbySearch} from '../src/nearby-search.mjs';
import {createLiveFollowSearch} from '../src/live-follow-search.mjs';

function fixture(){
 const workers=[],ready=[],messages=[],dropped=[],errors=[];
 const createWorker=()=>{const w={sent:[],terminated:false,postMessage(m){this.sent.push(m);},terminate(){this.terminated=true;},emit(data){this.onmessage?.({data});},fail(){this.onerror?.(new Error('worker'));}};workers.push(w);return w;};
 const lifecycle=createRouteWorkerLifecycle({createWorker,initMessage:{type:'init',url:'graph'},onReady:x=>ready.push(x),onMessage:x=>messages.push(x),onDropped:x=>dropped.push(x),onError:x=>errors.push(x)});
 lifecycle.start();return {lifecycle,workers,ready,messages,dropped,errors};
}
test('busy cancellation terminates, fences late events, and sends only latest queued job after new ready',()=>{
 const x=fixture(),a=x.workers[0];assert.deepEqual(a.sent,[{type:'init',url:'graph'}]);a.emit({type:'ready'});x.lifecycle.postMessage({type:'route',id:1});
 x.lifecycle.cancel();assert.equal(a.terminated,true);assert.equal(x.workers.length,2);const b=x.workers[1];
 x.lifecycle.postMessage({type:'route',id:2});x.lifecycle.postMessage({type:'route',id:3});assert.equal(x.dropped.some(m=>m.id===1),true);assert.equal(x.dropped.some(m=>m.id===2),true);
 a.emit({type:'ready'});a.emit({type:'route',id:1,result:{}});a.fail();assert.deepEqual(x.messages,[]);assert.deepEqual(x.errors,[]);
 assert.equal(b.sent.length,1);b.emit({type:'ready'});assert.deepEqual(b.sent.at(-1),{type:'route',id:3});b.emit({type:'route',id:3,result:{}});assert.deepEqual(x.messages.map(m=>m.id),[3]);
});
test('stale error ids do not kill the active current worker',()=>{
 const x=fixture(),w=x.workers[0];w.emit({type:'ready'});x.lifecycle.postMessage({type:'route',id:4});
 w.emit({type:'error',id:3,message:'old'});assert.equal(w.terminated,false);assert.deepEqual(x.errors,[]);
 w.emit({type:'route',id:4,result:{}});assert.deepEqual(x.messages.map(m=>m.id),[4]);
});
test('idle cancellation does not restart worker and result callback observes worker idle',()=>{
 const x=fixture(),w=x.workers[0];w.emit({type:'ready'});x.lifecycle.cancel();assert.equal(x.workers.length,1);assert.equal(w.terminated,false);
 x.lifecycle.postMessage({type:'route',id:4});w.emit({type:'route',id:4,result:{error:'NO_ROUTE'}});x.lifecycle.cancel();assert.equal(w.terminated,false);assert.equal(x.workers.length,1);
});
test('failure callback may clear the route without restarting a completed worker',()=>{
 let w,created=0,lifecycle;
 lifecycle=createRouteWorkerLifecycle({createWorker:()=>{created++;return w={sent:[],terminated:false,postMessage(x){this.sent.push(x);},terminate(){this.terminated=true;},emit(data){this.onmessage?.({data});}};},initMessage:{type:'init'},onMessage:()=>lifecycle.cancel()});
 lifecycle.start();w.emit({type:'ready'});lifecycle.postMessage({type:'route',id:4});w.emit({type:'route',id:4,result:{error:'NO_ROUTE'}});
 assert.equal(created,1);assert.equal(w.terminated,false);assert.equal(lifecycle.isReady(),true);lifecycle.dispose();
});
test('pending verification is dropped once and timeout cancellation only affects matching work',()=>{
 const x=fixture(),a=x.workers[0];a.emit({type:'ready'});x.lifecycle.postMessage({type:'verify-official',id:7});
 assert.equal(x.lifecycle.cancelIfActive('verify-official',8),false);assert.equal(a.terminated,false);
 assert.equal(x.lifecycle.cancelIfActive('verify-official',7),true);assert.equal(a.terminated,true);assert.deepEqual(x.dropped.map(x=>x.id),[7]);
 const b=x.workers[1];b.emit({type:'ready'});x.lifecycle.postMessage({type:'verify-official',id:8});b.emit({type:'verified-official',id:8,result:{}});x.lifecycle.cancel();
 assert.deepEqual(x.dropped.map(x=>x.id),[7]);assert.equal(b.terminated,false);
});
test('cancelling queued work while initializing does not resurrect it and disposal is isolated',()=>{
 const x=fixture(),a=x.workers[0];x.lifecycle.postMessage({type:'route',id:1});x.lifecycle.cancel();assert.equal(a.terminated,false);a.emit({type:'ready'});assert.equal(a.sent.length,1);
 x.lifecycle.dispose();assert.equal(a.terminated,true);a.emit({type:'ready'});assert.equal(x.lifecycle.isReady(),false);
});
test('cancelling the main worker does not terminate independent nearby or live-follow workers',async()=>{
 const main=fixture(),m=main.workers[0];m.emit({type:'ready'});main.lifecycle.postMessage({type:'route',id:1});
 const t=new Date().toISOString(),snapshot={schemaVersion:1,fetchedAt:t,sourceUpdatedAt:t,works:[]},aux=[];
 const make=()=>{const w={terminated:false,postMessage(){},terminate(){this.terminated=true;}};aux.push(w);return w;};
 const nearby=createNearbySearch({fetchSnapshot:async()=>snapshot,createWorker:make,onState:()=>{}}),live=createLiveFollowSearch({fetchSnapshot:async()=>snapshot,createWorker:make,onState:()=>{}});
 const args={startPlace:{lat:25,lon:121.5,timestamp:Date.now()},endPlace:{lat:25.01,lon:121.51},options:{},url:'graph',online:true};
 await nearby.start(args);await live.start(args);main.lifecycle.cancel();
 assert.equal(m.terminated,true);assert.equal(aux.length,2);assert.ok(aux.every(w=>!w.terminated));nearby.cancel();live.cancel();
});
test('optional reference work does not displace normal work and reports failed active identity',()=>{
 let worker,failed,dropped=[];const lifecycle=createRouteWorkerLifecycle({createWorker:()=>worker={postMessage(){},terminate(){},emit(data){this.onmessage({data});},fail(){this.onerror(new Error('broken'));}},initMessage:{type:'init'},onDropped:x=>dropped.push(x),onError:(e,m)=>failed=m});
 lifecycle.start();worker.emit({type:'ready'});const normal={type:'route',id:1};lifecycle.postMessage(normal);assert.equal(lifecycle.postMessage({type:'reference-route',id:2}),false);worker.emit({type:'route',id:1});const ref={type:'reference-route',id:3};assert.equal(lifecycle.postMessage(ref),true);worker.fail();assert.deepEqual(failed,ref);assert.deepEqual(dropped,[ref]);
});
