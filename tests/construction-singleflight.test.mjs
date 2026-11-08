import test from 'node:test';
import assert from 'node:assert/strict';
import {createConstructionSnapshotSource} from '../api/construction.js';
const stamp='Sun, 08 Nov 2026 01:00:00 GMT',now=Date.parse(stamp)+1000;
test('concurrent cold requests share one construction download',async()=>{
 let calls=0,finish;const get=createConstructionSnapshotSource({now:()=>now,fetcher:()=>{calls++;return new Promise(resolve=>{finish=resolve})}});
 const a=get(),b=get(),c=get();assert.equal(calls,1);finish({ok:true,headers:{get:()=>stamp},json:async()=>({type:'FeatureCollection',features:[]})});
 const [x,y,z]=await Promise.all([a,b,c]);assert.equal(x,y);assert.equal(y,z);await get();assert.equal(calls,1);
});
test('failed construction downloads are not cached and can be retried',async()=>{
 let calls=0;const get=createConstructionSnapshotSource({now:()=>now,fetcher:async()=>{if(++calls===1)throw Error('offline');return {ok:true,headers:{get:()=>stamp},json:async()=>({type:'FeatureCollection',features:[]})}}});
 await assert.rejects(get(),/offline/);assert.equal((await get()).sourceUpdatedAt,stamp);assert.equal(calls,2);
});

test('a temporary upstream failure can reuse only an unexpired snapshot without changing its age',async()=>{
 const stamp='Sun, 08 Nov 2026 01:00:00 GMT';let clock=Date.parse(stamp)+1000,calls=0;
 const get=createConstructionSnapshotSource({now:()=>clock,fetcher:async()=>{if(++calls>1)throw Error('offline');return {ok:true,headers:{get:()=>stamp},json:async()=>({type:'FeatureCollection',features:[]})}}});
 const first=await get();clock+=121000;const fallback=await get();assert.equal(fallback,first);assert.equal(fallback.fetchedAt,first.fetchedAt);
 clock=Date.parse(stamp)+31*60*1000;await assert.rejects(get(),/offline/);
});

test('all callers share the same unexpired fallback if a concurrent refresh fails',async()=>{
 const stamp='Sun, 08 Nov 2026 01:00:00 GMT';let clock=Date.parse(stamp)+1000,calls=0,fail;
 const get=createConstructionSnapshotSource({now:()=>clock,fetcher:()=>{if(++calls===1)return Promise.resolve({ok:true,headers:{get:()=>stamp},json:async()=>({type:'FeatureCollection',features:[]})});return new Promise((_,reject)=>{fail=reject})}});
 const cached=await get();clock+=121000;const a=get(),b=get();assert.equal(calls,2);fail(Error('offline'));assert.equal(await a,cached);assert.equal(await b,cached);
});
