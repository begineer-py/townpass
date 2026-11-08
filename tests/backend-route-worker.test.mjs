import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRoutePool} from '../server/route-pool.mjs';
import {createBackendRouteWorker} from '../src/backend-route-worker.mjs';
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
 assert.equal(validRouteTask({type:'init',id:1}),false);assert.equal(validRouteTask({type:'plan-places',id:1,startPlace:{lat:1,lon:1},endPlace:p}),false);
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
