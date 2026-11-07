import test from 'node:test';
import assert from 'node:assert/strict';
import {partialRoutePresentation} from '../src/partial-route-presentation.mjs';
const now=Date.parse('2026-11-07T12:00:00Z'),stamp=new Date(now).toISOString(),snapshot={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]},policy='test-policy';
const a=[25,121.5],b=[25,121.501],c=[25,121.503],d=[25,121.504];
const segment=(side,coordinates)=>({side,policyVersion:policy,geometryVerification:'pedestrian-network-v1',coordinates,networkCoordinates:coordinates,approaches:[],tierSegments:[{coordinates}],steps:[],distance:100,construction:{blocked:[],sourceUpdatedAt:stamp}});
const partial=()=>({complete:false,policyVersion:policy,constructionSourceUpdatedAt:stamp,segments:[segment('start',[a,b]),segment('end',[c,d])],gap:{kind:'between-network',startSide:b,endSide:c,straightMetres:200}});
test('two verified legs remain separate and are never marked complete',()=>{
 const view=partialRoutePresentation('NO_ROUTE',partial(),snapshot,policy,now);
 assert.equal(view.complete,false);assert.equal(view.segments.length,2);assert.deepEqual(view.segments.map(x=>x.coordinates),[[a,b],[c,d]]);
 assert.equal(view.coordinates,undefined);assert.match(view.message,/不是完整路線/);assert.match(view.message,/原目的地/);
});
test('a single destination-side leg is permitted with an explicit missing-start gap',()=>{
 const p=partial();p.segments=[p.segments[1]];p.gap={kind:'missing-start',startSide:null,endSide:c};
 const view=partialRoutePresentation('NO_CONNECTION',p,snapshot,policy,now);assert.equal(view.segments.length,1);assert.equal(view.segments[0].side,'end');
});
test('stale, blocked, unverified or inconsistent data is never presented',()=>{
 assert.equal(partialRoutePresentation('CONSTRUCTION_BLOCKED',partial(),snapshot,policy,now),null);
 assert.equal(partialRoutePresentation('NO_ROUTE',partial(),snapshot,policy,now+31*60000),null);
 const p=partial();p.segments[0].geometryVerification='unverified';assert.equal(partialRoutePresentation('NO_ROUTE',p,snapshot,policy,now),null);
 const q=partial();q.gap.startSide=c;assert.equal(partialRoutePresentation('NO_ROUTE',q,snapshot,policy,now),null);
 const r=partial();r.constructionSourceUpdatedAt='2020-01-01';assert.equal(partialRoutePresentation('NO_ROUTE',r,snapshot,policy,now),null);
 const s=partial();s.segments[0].construction.blocked=[{id:'closure'}];assert.equal(partialRoutePresentation('NO_ROUTE',s,snapshot,policy,now),null);
});
test('unconfirmed endpoint remains an explicitly marked approach, not route-gap geometry',()=>{
 const p=partial(),start=[25.0001,121.5];p.segments[0].coordinates=[start,a,b];
 p.segments[0].approaches=[{side:'start',coordinates:[start,a],estimated:true,unconfirmed:true}];
 const view=partialRoutePresentation('NO_ROUTE',p,snapshot,policy,now);assert.equal(view.segments[0].approaches[0].estimated,true);assert.equal(view.segments[0].approaches[0].unconfirmed,true);
 p.segments[0].approaches=[];assert.equal(partialRoutePresentation('NO_ROUTE',p,snapshot,policy,now),null);
});
test('inconsistent unconfirmed approach is not displayed as a confirmed connection',()=>{
 const p=partial(),start=[25.0001,121.5];p.segments[0].coordinates=[start,a,b];
 p.segments[0].approaches=[{side:'start',coordinates:[start,a],estimated:false,entryStatus:'unconfirmed'}];
 assert.equal(partialRoutePresentation('NO_ROUTE',p,snapshot,policy,now),null);
});
test('disconnected or fabricated tier overlay is discarded without drawing a line',()=>{
 const p=partial();p.segments[0].tierSegments=[{coordinates:[a,b]},{coordinates:[c,d]}];
 const view=partialRoutePresentation('NO_ROUTE',p,snapshot,policy,now);assert.deepEqual(view.segments[0].tierSegments,[]);
});
test('a via-side leg is not mislabeled as reachable from the original start',()=>{
 const p=partial(),chosen={start:{lat:25.01,lon:121.5},end:{lat:d[0],lon:d[1]}};
 const view=partialRoutePresentation('NO_ROUTE',p,snapshot,policy,now,chosen);
 assert.equal(view.segments.length,1);assert.equal(view.segments[0].side,'end');assert.equal(view.gap.kind,'missing-start');assert.equal(view.gap.startSide,null);
});
