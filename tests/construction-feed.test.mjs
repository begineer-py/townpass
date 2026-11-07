import test from 'node:test';
import assert from 'node:assert/strict';
import {createConstructionFeed} from '../src/construction-feed.mjs';
const stamp=Date.parse('2026-11-08T00:00:00Z');
const snapshot=(at=stamp,source=at)=>({schemaVersion:1,fetchedAt:new Date(at).toISOString(),sourceUpdatedAt:new Date(source).toISOString(),works:[]});
function clock(start=stamp){let now=start,id=0;const timers=new Map();return {now:()=>now,setTimer:(fn,ms)=>{const key=++id;timers.set(key,{fn,when:now+ms});return key;},clearTimer:key=>timers.delete(key),advance(ms){now+=ms;for(const [key,t] of [...timers])if(t.when<=now){timers.delete(key);t.fn();}},size:()=>timers.size};}
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
test('loads fresh construction and retains it briefly after a failed refresh',async()=>{
 const c=clock(),states=[],values=[snapshot(),{error:'offline'}],feed=createConstructionFeed({...c,fetchSnapshot:async()=>values.shift(),onState:s=>states.push(s)});
 feed.start();await flush();assert.equal(states.at(-1).status,'ready');assert.equal(states.at(-1).snapshot.fetchedAt,new Date(stamp).toISOString());
 await feed.refresh();assert.equal(states.at(-1).status,'update-failed');assert.ok(states.at(-1).snapshot);feed.stop();assert.equal(c.size(),0);
});
test('expires old work and cannot republish an old response after stopping',async()=>{
 const c=clock(),states=[];let finish;const values=[snapshot(),null],feed=createConstructionFeed({...c,fetchSnapshot:()=>values.shift()||new Promise(resolve=>{finish=resolve;}),onState:s=>states.push(s)});
 feed.start();await flush();assert.equal(states.at(-1).status,'ready');c.advance(30*60*1000+1);assert.equal(states.at(-1).snapshot,null);assert.ok(['loading','unavailable'].includes(states.at(-1).status));const count=states.length;feed.stop();finish(snapshot(c.now()));await flush();assert.equal(states.length,count);assert.equal(c.size(),0);
});
test('rejects an already expired upstream snapshot',async()=>{
 const c=clock(),states=[],feed=createConstructionFeed({...c,fetchSnapshot:async()=>snapshot(stamp,stamp-31*60*1000),onState:s=>states.push(s)});
 feed.start();await flush();assert.equal(states.at(-1).status,'unavailable');assert.equal(states.at(-1).snapshot,null);feed.stop();
});
