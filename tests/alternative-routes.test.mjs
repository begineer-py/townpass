import test from 'node:test';import assert from 'node:assert/strict';
import {searchVerifiedAlternatives,createDetourWaypoints} from '../src/alternative-routes.mjs';
const start=[25,121.5],end=[25.01,121.51],via1=[25.001,121.501],via2=[25.002,121.502];
test('continues to a different via with the original endpoints unchanged until verification succeeds',async()=>{
 const calls=[];const r=await searchVerifiedAlternatives({start,end,waypoints:[via1,via2],query:async(a,b,via)=>{calls.push([a,b,via]);return {via};},verify:async c=>c.via===via1?{error:'OFFICIAL_PATH_UNVERIFIED'}:{policyVersion:'tested',distance:600}});
 assert.equal(r.attempts,2);assert.equal(r.route.distance,600);assert.deepEqual(calls.map(x=>x.slice(0,2)),[[start,end],[start,end]]);
});
test('never releases an unverified candidate when every detour fails',async()=>{
 const r=await searchVerifiedAlternatives({start,end,waypoints:[via1],query:async()=>({coordinates:[start,end]}),verify:async()=>({error:'CONSTRUCTION_BLOCKED'})});assert.equal(r.route,undefined);assert.equal(r.error,'NO_VERIFIED_ALTERNATIVE');
});
test('cancellation prevents additional queries and stale success',async()=>{
 const ctl=new AbortController();let n=0;await assert.rejects(()=>searchVerifiedAlternatives({start,end,waypoints:[via1,via2],signal:ctl.signal,query:async()=>{n++;ctl.abort();return {};},verify:async()=>({distance:1})}),{name:'AbortError'});assert.equal(n,1);
});
test('detour selection uses existing pedestrian graph endpoints and caps geographic spread',()=>{
 const graph={nodes:[[25.005,121.507,0],[25.003,121.505,0],[26,122,0]],edges:[[0,1]]};const p=createDetourWaypoints(graph)(start,end);assert.ok(p.length>0);assert.ok(p.every(x=>graph.nodes.some(n=>n[0]===x[0]&&n[1]===x[1])));assert.ok(p.length<=8);
});
