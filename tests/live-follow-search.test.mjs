import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveFollowSearch} from '../src/live-follow-search.mjs';
import {createLiveFollow} from '../src/live-follow.mjs';

const clock=Date.parse('2026-11-07T14:00:00Z');
const snapshot={schemaVersion:1,fetchedAt:new Date(clock).toISOString(),sourceUpdatedAt:new Date(clock).toISOString(),works:[]};
const input={startPlace:{id:'my-location',timestamp:clock},endPlace:{id:'destination'},options:{minWidth:.9},url:'http://localhost/data/graph.json.gz',online:true};
function fixture(fetchSnapshot=async()=>snapshot){
 const states=[],workers=[];
 const search=createLiveFollowSearch({fetchSnapshot,now:()=>clock,onState:s=>states.push(s),createWorker:()=>{const w={sent:[],terminated:false,postMessage(m){this.sent.push(m);},terminate(){this.terminated=true;}};workers.push(w);return w;}});
 return {states,workers,search};
}
test('returns independently planned route and keeps destination and options',async()=>{
 const x=fixture();await x.search.start(input);const w=x.workers[0],id=w.sent[0];assert.equal(id.type,'init');
 w.onmessage({data:{type:'ready'}});const request=w.sent.at(-1);assert.equal(request.type,'plan-places');assert.equal(request.endPlace.id,'destination');assert.equal(request.options.minWidth,.9);
 w.onmessage({data:{type:'route',id:request.id,result:{coordinates:[[25,121.5],[25,121.501]],policyVersion:'test'}}});
 assert.equal(x.states.at(-1).status,'ready');assert.equal(w.terminated,true);
});
test('cancel rejects late worker results after the user changes destination',async()=>{
 const x=fixture();await x.search.start(input);const w=x.workers[0];w.onmessage({data:{type:'ready'}});const request=w.sent.at(-1);x.search.cancel();
 w.onmessage({data:{type:'route',id:request.id,result:{coordinates:[[25,121.5],[25,121.501]]}}});
 assert.equal(w.terminated,true);assert.equal(x.states.some(s=>s.status==='ready'),false);
});
test('a newer inaccurate fix cancels an in-flight replan and rejects the late worker result',async()=>{
 const x=fixture();let now=clock,status;
 const line=[[25,121.5],[25,121.501]], fix=accuracy=>({lat:25.0005,lon:121.5005,accuracy,timestamp:now});
 const engine=createLiveFollow({coordinates:line,now:()=>now,onStatus:s=>status=s,onUncertain:()=>x.search.cancel(),onReplan:p=>void x.search.start({...input,startPlace:p})});
 engine.sample(fix(3));now+=1000;engine.sample(fix(3));
 await Promise.resolve();const w=x.workers[0];w.onmessage({data:{type:'ready'}});const request=w.sent.at(-1);
 now+=1000;engine.sample(fix(80));
 w.onmessage({data:{type:'route',id:request.id,result:{coordinates:line}}});
 assert.equal(w.terminated,true);assert.equal(x.states.some(s=>s.status==='ready'),false);assert.equal(status,'uncertain');
});
test('stale construction or location cannot publish a route',async()=>{
 const old={...snapshot,sourceUpdatedAt:new Date(clock-31*60000).toISOString()};const x=fixture(async()=>old);await x.search.start(input);assert.equal(x.states.at(-1).status,'error');assert.equal(x.workers.length,0);
 const y=fixture();await y.search.start({...input,startPlace:{id:'my-location',timestamp:clock-31000}});const w=y.workers[0];w.onmessage({data:{type:'ready'}});const request=w.sent.at(-1);w.onmessage({data:{type:'route',id:request.id,result:{coordinates:[[25,121.5],[25,121.501]]}}});assert.equal(y.states.at(-1).status,'error');
});
test('cancel while construction fetch is pending discards its result',async()=>{
 let resolve;const x=fixture(()=>new Promise(r=>resolve=r));const pending=x.search.start(input);x.search.cancel();resolve(snapshot);await pending;assert.equal(x.workers.length,0);assert.equal(x.states.some(s=>s.status==='ready'),false);
});
