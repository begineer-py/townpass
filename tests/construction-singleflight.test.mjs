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
