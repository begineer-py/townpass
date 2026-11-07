import test from 'node:test';import assert from 'node:assert/strict';
import {createMapSnapSearch} from '../src/map-snap-search.mjs';import {ROUTING_POLICY} from '../src/routing.mjs';
const stamp=new Date().toISOString(),snapshot={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]};
const place={id:'point-123',originKind:'map',lat:25,lon:121.5};
const snap={point:[25,121.5],original:[25,121.5],distanceMetres:0,originalAccess:'unconfirmed',source:'osm',coverage:'osm-and-official',policyVersion:ROUTING_POLICY,constructionSourceUpdatedAt:stamp};
function setup(fetch=async()=>snapshot){const states=[],sent=[],cancels=[],life={postMessage:m=>(sent.push(m),true),cancelIfActive:(type,id)=>cancels.push([type,id])};const search=createMapSnapSearch({fetchSnapshot:fetch,getLifecycle:()=>life,onState:s=>states.push(s)});return {states,sent,cancels,search};}
const args={place,side:'end',online:true,options:{}};
test('map pick uses a fresh snapshot and returns the verified worker result',async()=>{
 const f=setup(),promise=f.search.start(args);await Promise.resolve();await Promise.resolve();const request=f.sent[0];assert.equal(request.type,'snap-map-point');assert.equal(request.place,place);assert.equal(f.search.handleMessage({type:'snap-map-point',id:request.id,result:snap}),true);assert.deepEqual(await promise,snap);assert.equal(f.states.at(-1).status,'ready');
});
test('cancellation resolves the previous pick and ignores late worker replies',async()=>{
 const f=setup(),promise=f.search.start(args);await Promise.resolve();await Promise.resolve();const request=f.sent[0];f.search.cancel();assert.equal((await promise).error,'CANCELLED');assert.deepEqual(f.cancels,[['snap-map-point',request.id]]);assert.equal(f.search.handleMessage({type:'snap-map-point',id:request.id,result:snap}),false);assert.equal(f.states.at(-1).status,'idle');
});
test('rejects stale snapshots and invalid returned geometry',async()=>{
 const bad={...snapshot,sourceUpdatedAt:'2000-01-01T00:00:00Z'},x=setup(async()=>bad);assert.equal((await x.search.start(args)).error,'CONSTRUCTION_UNAVAILABLE');assert.equal(x.sent.length,0);
 const f=setup(),promise=f.search.start(args);await Promise.resolve();await Promise.resolve();const request=f.sent[0];f.search.handleMessage({type:'snap-map-point',id:request.id,result:{...snap,point:[25.01,121.5],distanceMetres:0}});assert.equal((await promise).error,'SNAP_UNVERIFIED');
});
test('untrusted or non-map location cannot enter snapping',async()=>{
 const f=setup();assert.equal((await f.search.start({...args,place:{...place,originKind:'gps',id:'my-location'}})).error,'SNAP_INVALID');assert.equal(f.sent.length,0);
});
