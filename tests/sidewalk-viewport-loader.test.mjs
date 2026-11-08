import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSidewalkLines} from '../src/sidewalk-viewport-loader.mjs';

test('collects a complete viewport and deduplicates overlapping lines', async()=>{
 const tiles={a:[{id:1,points:[[1,2]]}],b:[{id:1,points:[[1,2]]},{id:2,points:[[3,4]]}]};
 assert.deepEqual(await loadSidewalkLines(['a','b'],async key=>tiles[key],()=>true),[[[1,2]],[[3,4]]]);
});
test('a newer viewport cancels a pending older request without publishing partial lines', async()=>{
 let current=true,resolve;const waiting=new Promise(r=>{resolve=r});let calls=0;
 const pending=loadSidewalkLines(['a','b'],async()=>{calls++;return waiting},()=>current);
 current=false;resolve([{id:1,points:[[1,2]]}]);assert.equal(await pending,null);assert.equal(calls,1);
});
test('tile failures reject instead of publishing an incomplete viewport',async()=>{
 await assert.rejects(loadSidewalkLines(['a','b'],async key=>{if(key==='b')throw Error('offline');return [{id:1,points:[[1,2]]}]},()=>true),/offline/);
});
