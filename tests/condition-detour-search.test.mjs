import test from 'node:test';
import assert from 'node:assert/strict';
import {createConditionDetourSearch} from '../src/condition-detour-search.mjs';
const snapshot=()=>{const s=new Date().toISOString();return {schemaVersion:1,fetchedAt:s,sourceUpdatedAt:s,works:[]};};
test('cancel terminates worker and discards late route results',async()=>{
 const states=[],messages=[],w={postMessage:m=>messages.push(m),terminate(){this.terminated=true;}};
 const search=createConditionDetourSearch({fetchSnapshot:async()=>snapshot(),createWorker:()=>w,onState:s=>states.push(s)});
 await search.start({startPlace:{},endPlace:{},options:{},url:'http://test/graph',target:{id:'1',type:'missing_noCurbSlope'},online:true});
 w.onmessage({data:{type:'ready'}});const id=messages.at(-1).id;search.cancel();
 w.onmessage({data:{type:'avoid-official-condition',id,result:{coordinates:[[25,121],[25.1,121.1]]}}});
 assert.equal(w.terminated,true);assert.equal(states.at(-1).status,'idle');assert.equal(states.some(s=>s.status==='ready'),false);
});
test('failed detour does not replace the original route or refresh its construction snapshot',async()=>{
 const states=[],messages=[],snapshots=[],w={postMessage:m=>messages.push(m),terminate(){}};
 const search=createConditionDetourSearch({fetchSnapshot:async()=>snapshot(),createWorker:()=>w,onState:s=>states.push(s),onSnapshot:s=>snapshots.push(s)});
 await search.start({startPlace:{},endPlace:{},options:{},url:'http://test/graph',target:{id:'1',type:'missing_noCurbSlope'},online:true});
 w.onmessage({data:{type:'ready'}});const id=messages.at(-1).id;w.onmessage({data:{type:'avoid-official-condition',id,result:{error:'NO_CONDITION_DETOUR'}}});
 assert.equal(states.at(-1).status,'error');assert.match(states.at(-1).message,/原路線仍可查看/);assert.equal(snapshots.length,0);
});
test('projection exhaustion keeps the original route and asks for retry',async()=>{
 const states=[],messages=[],w={postMessage:m=>messages.push(m),terminate(){}};
 const search=createConditionDetourSearch({fetchSnapshot:async()=>snapshot(),createWorker:()=>w,onState:s=>states.push(s)});
 await search.start({startPlace:{},endPlace:{},options:{},url:'http://test/graph',targets:[],online:true});
 w.onmessage({data:{type:'ready'}});const id=messages.at(-1).id;
 w.onmessage({data:{type:'avoid-official-condition',id,result:{error:'PROJECTION_LIMIT'}}});
 assert.equal(states.at(-1).status,'error');assert.match(states.at(-1).message,/上限.*重試.*原路線/);
});
