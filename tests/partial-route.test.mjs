import test from 'node:test';
import assert from 'node:assert/strict';
import {createRouter} from '../src/routing.mjs';
import {createLocalRouteVerifier} from '../src/local-route-verifier.mjs';
import {createVerifiedRouter} from '../src/pedestrian-planning.mjs';
import {createConstructionChecker} from '../src/construction.mjs';
import {verifiedPartialRoute} from '../src/partial-route.mjs';
const proof={schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
const points=[[25,121.5],[25,121.501],[25,121.51],[25,121.511]];
const graph=()=>({officialPathEvidence:{schemaVersion:2},nodes:points.map((p,i)=>[...p,0,i+1]),ways:[{highway:'footway',width:2,slope:0}],edges:[[0,1,100,0,[],proof],[2,3,100,0,[],proof]],officialAreas:[],officialCrossingAreas:[],roadGeometries:[]});
const snapshot=()=>({schemaVersion:1,fetchedAt:new Date().toISOString(),sourceUpdatedAt:new Date().toISOString(),works:[]});
function run(start,end,options={},works=[]){const g=graph(),verifyLocal=createLocalRouteVerifier(g),router=createVerifiedRouter(g,verifyLocal),s=snapshot();s.works=works;const checker=createConstructionChecker(s),prefs={...options,lineAllowed:checker.allowed,diagnosePartial:true};const diagnostic=router(start,end,prefs);return {diagnostic,partial:verifiedPartialRoute(diagnostic,start,end,prefs,s,{verifyLocal,checker}),s,verifyLocal,checker};}
test('disconnected components produce separately verified oriented segments with no gap line',()=>{const {diagnostic,partial}=run(points[0],points[3]);assert.equal(diagnostic.error,'NO_ROUTE');assert.equal(partial.complete,false);assert.deepEqual(partial.segments.map(s=>s.side),['start','end']);assert.deepEqual(partial.segments[0].coordinates[0],points[0]);assert.deepEqual(partial.segments[1].coordinates.at(-1),points[3]);assert.deepEqual(partial.gap.startSide,points[1]);assert.deepEqual(partial.gap.endSide,points[2]);assert.ok(partial.segments.every(s=>s.geometryVerification==='pedestrian-network-v1'));});
test('one missing endpoint yields only the other real walk',()=>{const missing=[25.02,121.52],{diagnostic,partial}=run(points[0],missing);assert.equal(diagnostic.error,'NO_CONNECTION');assert.equal(partial.segments.length,1);assert.equal(partial.segments[0].side,'start');assert.equal(partial.gap.endSide,null);assert.equal(partial.gap.kind,'missing-end');});
test('estimated original endpoint remains marked and stale construction cannot publish segments',()=>{const p=[25.0001,121.5],place={id:'point-1',originKind:'map',lat:p[0],lon:p[1]},r=run(p,points[3],{startPlace:place});assert.equal(r.partial.segments[0].approaches[0].unconfirmed,true);r.s.sourceUpdatedAt='2000-01-01T00:00:00Z';assert.equal(verifiedPartialRoute(r.diagnostic,p,points[3],{startPlace:place},r.s,{verifyLocal:r.verifyLocal,checker:r.checker}),null);});
test('blocked or forged segments are never published',()=>{const r=run(points[0],points[3]);const checker={inspect:()=>({blocked:[{}]})};assert.equal(verifiedPartialRoute(r.diagnostic,points[0],points[3],{},r.s,{verifyLocal:r.verifyLocal,checker}),null);r.diagnostic.partialCandidates[0].route.coordinates[0]=[25.1,121.7];const p=verifiedPartialRoute(r.diagnostic,points[0],points[3],{},r.s,{verifyLocal:r.verifyLocal,checker:r.checker});assert.equal(p.segments.length,1);assert.equal(p.gap.startSide,null);});
test('a known restricted endpoint cannot be smuggled into a partial segment',()=>{
 const g=graph(),closed={id:'closed',kind:'park',lat:points[0][0],lon:points[0][1],access:'no'},verifyLocal=createLocalRouteVerifier(g,[],[closed]);
 const router=createVerifiedRouter(g,verifyLocal),s=snapshot(),checker=createConstructionChecker(s),prefs={startPlace:closed,lineAllowed:checker.allowed,diagnosePartial:true};
 const diagnostic=router(points[0],points[3],prefs),partial=verifiedPartialRoute(diagnostic,points[0],points[3],prefs,s,{verifyLocal,checker});
 assert.equal(diagnostic.error,'NO_CONNECTION');assert.equal(partial.segments.length,1);assert.equal(partial.segments[0].side,'end');assert.equal(partial.gap.startSide,null);
 assert.ok(partial.segments.every(segment=>segment.coordinates.every(p=>p[0]!==points[0][0]||p[1]!==points[0][1])));
});
test('real construction geometry excludes affected edges and cannot be returned as a segment',()=>{
 const work={id:'x',impact:'blocked',start:'',end:'',hours:'',geometries:[{type:'Point',coordinates:[[25,121.5005]]}]};
 const {diagnostic,partial}=run(points[0],points[3],{},[work]);
 assert.equal(diagnostic.error,'NO_ROUTE');assert.ok(!partial||partial.segments.every(s=>s.side==='end'));
});

