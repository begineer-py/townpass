import test from 'node:test';
import assert from 'node:assert/strict';
import {planConstructionDetour} from '../src/construction-detour.mjs';
import {ROUTING_POLICY} from '../src/routing.mjs';
const now=Date.parse('2026-11-07T22:51:00Z'),stamp=new Date(now).toISOString();
const start={lat:25,lon:121.5},end={lat:25,lon:121.501},line=[[25,121.5],[25,121.501]];
const work={id:'work-1',impact:'clear',start:'115/11/08',end:'115/11/08',hours:'24小時施工',geometries:[{type:'Point',coordinates:[[25.00005,121.5005]]}]};
const snapshot={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[work]};
const verified=coordinates=>({coordinates,resolvedStart:start,resolvedEnd:end,policyVersion:ROUTING_POLICY,geometryVerification:'pedestrian-network-v1'});
test('only explicit clear work becomes a temporary avoidance area, without changing the feed',()=>{
 const detour=[[25,121.5],[25.0003,121.5005],[25,121.501]];
 const result=planConstructionDetour(start,end,{},snapshot,['work-1'],{now,plan:(a,b,o,temp,checker)=>{
  assert.equal(temp.works[0].impact,'blocked');assert.equal(checker.allowed(line),false);assert.equal(checker.allowed(detour),true);return verified(detour);
 }});
 assert.equal(result.error,undefined);assert.equal(snapshot.works[0].impact,'clear');assert.equal(result.construction.blocked.length,0);assert.deepEqual(result.constructionDetour.ids,['work-1']);
});
test('rejects routes that still pass the selected area, changed endpoints or stale selections',()=>{
 assert.equal(planConstructionDetour(start,end,{},snapshot,['work-1'],{now,plan:()=>verified(line)}).error,'NO_DETOUR');
 assert.equal(planConstructionDetour(start,end,{},snapshot,['missing'],{now,plan:()=>{throw Error('must not plan');}}).error,'STALE_SELECTION');
 const moved={...verified([[25,121.5],[25.0003,121.5005],[25,121.501]]),resolvedEnd:{lat:25,lon:121.502}};
 assert.equal(planConstructionDetour(start,end,{},snapshot,['work-1'],{now,plan:()=>moved}).error,'UNVERIFIED_NETWORK');
});
