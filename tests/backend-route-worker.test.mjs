import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRoutePool} from '../server/route-pool.mjs';
import {createBackendRouteWorker} from '../src/backend-route-worker.mjs';
import {createRouteWorkerLifecycle} from '../src/route-worker-lifecycle.mjs';
import handler,{validRouteTask} from '../api/route-compute.js';

class FakeWorker extends EventEmitter {
 constructor(){super();this.messages=[];this.terminated=false;}
 postMessage(message){this.messages.push(message);}
 terminate(){this.terminated=true;return Promise.resolve();}
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('pool reuses a ready engine and serializes independent requests',async()=>{
 const workers=[];const pool=createRoutePool({createWorker:()=>{const w=new FakeWorker();workers.push(w);return w;}});
 const a=pool.execute({id:1,type:'route'}),b=pool.execute({id:2,type:'route'});assert.equal(workers.length,1);workers[0].emit('message',{type:'ready'});
 assert.equal(workers[0].messages.at(-1).id,1);workers[0].emit('message',{type:'route',id:1,result:{ok:1}});assert.equal((await a).result.ok,1);
 assert.equal(workers[0].messages.at(-1).id,2);workers[0].emit('message',{type:'route',id:2,result:{ok:2}});assert.equal((await b).result.ok,2);pool.dispose();
});
test('cancel interrupts the active engine and preserves the queued task',async()=>{
 const workers=[],pool=createRoutePool({createWorker:()=>{const w=new FakeWorker();workers.push(w);return w;}}),abort=new AbortController();
 const a=pool.execute({id:1,type:'route'},{signal:abort.signal}),b=pool.execute({id:2,type:'route'});workers[0].emit('message',{type:'ready'});abort.abort();await assert.rejects(a,/CANCELLED/);assert.equal(workers[0].terminated,true);
 assert.equal(workers.length,2);workers[1].emit('message',{type:'ready'});workers[1].emit('message',{type:'route',id:2,result:{ok:true}});assert.equal((await b).result.ok,true);pool.dispose();
});
test('initialization failure rejects pending work without retry loops',async()=>{
 const w=new FakeWorker(),pool=createRoutePool({createWorker:()=>w});const a=pool.execute({id:1,type:'route'});w.emit('message',{type:'error',message:'bad graph'});await assert.rejects(a,/INIT_FAILED/);assert.equal(w.terminated,true);pool.dispose();
});
test('browser transport never requests the graph or sends the construction dataset',async()=>{
 const calls=[],reply={type:'route',id:4,result:{distance:12}},worker=createBackendRouteWorker({fetcher:async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return {ok:true,json:async()=>reply}}});let result;
 worker.onmessage=event=>{result=event.data};worker.postMessage({type:'init',url:'https://example.invalid/graph'});await flush();assert.equal(result.type,'ready');
 worker.postMessage({type:'plan-places',id:4,construction:{sourceUpdatedAt:'stamp',works:[{private:'unused'}]}});await flush();assert.deepEqual(result,reply);assert.equal(calls.length,1);assert.equal(calls[0].url,'./api/route-compute');assert.equal(calls[0].body.constructionSourceUpdatedAt,'stamp');assert.equal('construction' in calls[0].body.task,false);worker.terminate();
});
test('termination aborts a pending request without delivering a late reply',async()=>{
 let signal,resolve;const worker=createBackendRouteWorker({fetcher:(url,opts)=>{signal=opts.signal;return new Promise(r=>{resolve=r;});}});let called=false;worker.onmessage=()=>{called=true};worker.postMessage({type:'route',id:5,construction:{sourceUpdatedAt:'stamp'}});worker.terminate();assert.equal(signal.aborted,true);resolve({ok:true,json:async()=>({type:'route',id:5})});await flush();assert.equal(called,false);
});
test('route API validates task types, coverage, size and methods',async()=>{
 const p={lat:25.05,lon:121.52};assert.equal(validRouteTask({type:'plan-places',id:1,startPlace:p,endPlace:p}),true);
 assert.equal(validRouteTask({type:'init',id:1}),false);assert.equal(validRouteTask({type:'official-plan',id:1}),false);assert.equal(validRouteTask({type:'plan-places',id:1,startPlace:{lat:1,lon:1},endPlace:p}),false);
 const response=()=>{const r=new EventEmitter();r.headers={};r.setHeader=(k,v)=>r.headers[k]=v;r.end=s=>{r.body=JSON.parse(s);r.writableEnded=true};return r;};
 for(const [req,status] of [[{method:'GET'},405],[{method:'POST',body:{task:{type:'init',id:1},constructionSourceUpdatedAt:'x'}},400],[{method:'POST',body:{data:'x'.repeat(2000001)}},413]]){const res=response();await handler(req,res);assert.equal(res.statusCode,status);}
});

test('backend uses its own construction snapshot and rejects a changed source',async t=>{
 const stamp=new Date().toUTCString();let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;return {ok:true,headers:{get:()=>stamp},json:async()=>({type:'FeatureCollection',features:[]})}});
 const response=()=>{const r=new EventEmitter();r.setHeader=()=>{};r.end=s=>{r.body=JSON.parse(s);r.writableEnded=true};return r;};
 const p={lat:25.05,lon:121.52},res=response();
 await handler({method:'POST',body:{task:{type:'plan-places',id:7,startPlace:p,endPlace:p,construction:{works:[]}},constructionSourceUpdatedAt:'forged'}},res);
 assert.equal(res.statusCode,200);assert.equal(res.body.result.error,'CONSTRUCTION_UNAVAILABLE');assert.equal(res.body.type,'route');assert.equal(calls,1);
});

test('prewarming overlaps initialization and shares one worker with real requests',async()=>{
 const workers=[];const pool=createRoutePool({createWorker:()=>{const w=new FakeWorker();workers.push(w);return w;}});
 const releaseA=pool.warm(),releaseB=pool.warm();assert.equal(workers.length,1);assert.equal(workers[0].messages[0].type,'init');
 const job=pool.execute({id:9,type:'route'});releaseA();releaseB();assert.equal(workers[0].terminated,false);
 workers[0].emit('message',{type:'ready'});assert.equal(workers[0].messages.at(-1).id,9);workers[0].emit('message',{type:'route',id:9,result:{ok:true}});
 assert.equal((await job).result.ok,true);pool.dispose();
});
test('abandoned prewarming stops only after the last interested request leaves',()=>{
 const workers=[],pool=createRoutePool({createWorker:()=>{const w=new FakeWorker();workers.push(w);return w;}});
 const a=pool.warm(),b=pool.warm();a();assert.equal(workers[0].terminated,false);b();assert.equal(workers[0].terminated,true);pool.dispose();
});
test('a prewarmed initialization failure permits a later clean retry',async()=>{
 const workers=[],pool=createRoutePool({createWorker:()=>{const w=new FakeWorker();workers.push(w);return w;}});
 const release=pool.warm();workers[0].emit('message',{type:'error',message:'bad graph'});release();assert.equal(workers[0].terminated,true);
 const job=pool.execute({id:3,type:'route'});assert.equal(workers.length,2);workers[1].emit('message',{type:'ready'});workers[1].emit('message',{type:'route',id:3,result:{ok:true}});assert.equal((await job).result.ok,true);pool.dispose();
});

test('a synchronous prewarm initialization failure does not escape or strand later work',async()=>{
 const workers=[],pool=createRoutePool({createWorker:()=>{const w=new FakeWorker();if(!workers.length)w.postMessage=()=>{throw Error('cannot init')};workers.push(w);return w;}});
 const release=pool.warm();assert.equal(workers[0].terminated,true);release();const job=pool.execute({id:12,type:'route'});
 workers[1].emit('message',{type:'ready'});workers[1].emit('message',{type:'route',id:12,result:{ok:true}});assert.equal((await job).result.ok,true);pool.dispose();
});

test('invalid response types, identifiers, and results fail rather than leave planning pending',async()=>{
 for(const bad of [{type:'wrong',id:1,result:{}},{type:'route',id:2,result:{}},{type:'route',id:1},{type:'route',id:1,result:null},{type:'route',id:1,result:[]},null]){
  let error,called=false;const worker=createBackendRouteWorker({fetcher:async()=>({ok:true,json:async()=>bad})});
  worker.onerror=e=>{error=e};worker.onmessage=()=>{called=true};worker.postMessage({type:'plan-places',id:1,construction:{sourceUpdatedAt:'stamp'}});await flush();
  assert.equal(error?.message,'ROUTE_BACKEND_INVALID_RESPONSE');assert.equal(called,false);worker.terminate();
 }
});
test('a stuck backend request times out, aborts and reports an error once',async()=>{
 let signal,errorCount=0,error;const worker=createBackendRouteWorker({timeoutMs:10,fetcher:(_url,opts)=>{signal=opts.signal;return new Promise(()=>{})}});
 worker.onerror=e=>{error=e;errorCount++};worker.postMessage({type:'plan-places',id:1,construction:{sourceUpdatedAt:'stamp'}});
 await new Promise(resolve=>setTimeout(resolve,30));assert.equal(signal.aborted,true);assert.equal(error?.message,'ROUTE_BACKEND_TIMEOUT');assert.equal(errorCount,1);worker.terminate();
});
test('backend capacity responses are distinguished from connectivity errors',async()=>{
 let error;const worker=createBackendRouteWorker({fetcher:async()=>({ok:false,json:async()=>({error:'ROUTING_BUSY'})})});worker.onerror=e=>{error=e};worker.postMessage({type:'plan-places',id:1,construction:{sourceUpdatedAt:'stamp'}});await flush();assert.equal(error?.message,'ROUTING_BUSY');worker.terminate();
});
test('a single backend instance queues six requests and keeps a bounded limit',async()=>{
 const w=new FakeWorker(),pool=createRoutePool({createWorker:()=>w}),jobs=Array.from({length:8},(_,i)=>pool.execute({type:'route',id:i}));
 await assert.rejects(pool.execute({type:'route',id:9}),/ROUTING_BUSY/);w.emit('message',{type:'ready'});
 for(let i=0;i<8;i++){assert.equal(w.messages.at(-1).id,i);w.emit('message',{type:'route',id:i,result:{distance:i}});assert.equal((await jobs[i]).result.distance,i);}pool.dispose();
});

test('a malformed response releases the lifecycle so a new route can be requested',async()=>{
 let fetchCount=0;const errors=[],messages=[];
 const lifecycle=createRouteWorkerLifecycle({createWorker:()=>createBackendRouteWorker({fetcher:async()=>({ok:true,json:async()=>++fetchCount===1?{type:'wrong',id:1,result:{}}:{type:'route',id:2,result:{distance:10}}})}),initMessage:{type:'init'},onError:e=>errors.push(e.message),onMessage:d=>messages.push(d)});
 lifecycle.start();await flush();lifecycle.postMessage({type:'plan-places',id:1,construction:{sourceUpdatedAt:'stamp'}});await flush();assert.deepEqual(errors,['ROUTE_BACKEND_INVALID_RESPONSE']);
 lifecycle.start();await flush();assert.equal(lifecycle.postMessage({type:'plan-places',id:2,construction:{sourceUpdatedAt:'stamp'}}),true);await flush();assert.equal(messages.at(-1)?.result.distance,10);lifecycle.dispose();
});

test('single-route calculation and construction data start together and publish only after matching',async()=>{
 let routeResolve,snapshotResolve,requests=0,loads=0,delivered;
 const stamp=new Date().toISOString(),snapshot={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]};
 const worker=createBackendRouteWorker({fetcher:(_url,opts)=>{requests++;assert.equal(JSON.parse(opts.body).constructionSourceUpdatedAt,undefined);return new Promise(resolve=>{routeResolve=resolve})}});
 worker.onmessage=e=>{delivered=e.data};worker.postMessage({type:'plan-places',id:3,loadConstruction:()=>{loads++;return new Promise(resolve=>{snapshotResolve=resolve})}});await flush();
 assert.equal(requests,1);assert.equal(loads,1);routeResolve({ok:true,json:async()=>({type:'route',id:3,result:{distance:696},constructionSourceUpdatedAt:stamp})});await flush();assert.equal(delivered,undefined);
 snapshotResolve(snapshot);await flush();assert.equal(delivered.result.distance,696);worker.terminate();
});
test('a changed or unavailable construction snapshot cannot publish a calculated route',async()=>{
 for(const scenario of ['changed','unavailable']){
  const stamp=new Date().toISOString(),snapshot=scenario==='changed'?{schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]}:{error:'CONSTRUCTION_UNAVAILABLE'};
  let error,delivered=false;const worker=createBackendRouteWorker({fetcher:async()=>({ok:true,json:async()=>({type:'route',id:4,result:{distance:1},constructionSourceUpdatedAt:'different'})})});
  worker.onerror=e=>{error=e};worker.onmessage=()=>{delivered=true};worker.postMessage({type:'plan-places',id:4,loadConstruction:async()=>snapshot});await flush();
  assert.equal(error?.message,'CONSTRUCTION_UNAVAILABLE');assert.equal(delivered,false);worker.terminate();
 }
});
test('cancelling a parallel route request also aborts the construction request',async()=>{
 let constructionSignal,backendSignal;const worker=createBackendRouteWorker({fetcher:(_url,opts)=>{backendSignal=opts.signal;return new Promise(()=>{})}});
 worker.postMessage({type:'plan-places',id:4,loadConstruction:signal=>{constructionSignal=signal;return new Promise(()=>{})}});await flush();worker.terminate();assert.equal(backendSignal.aborted,true);assert.equal(constructionSignal.aborted,true);
});
