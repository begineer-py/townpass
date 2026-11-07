import test from 'node:test';
import assert from 'node:assert/strict';
import {createOfficialRouteVerifier} from '../src/verify-official-route.mjs';
const box=(x1,y1,x2,y2)=>({type:'Polygon',coordinates:[[[x1,y1],[x2,y1],[x2,y2],[x1,y2],[x1,y1]]]});
const graph=()=>({officialPathEvidence:{schemaVersion:2},officialAreas:[box(121.5,25,121.501,25.001)],officialCrossingAreas:[],roadGeometries:[[[121.5005,25],[121.5005,25.001]]],nodes:[],ways:[],edges:[]});
const a=[25.0002,121.5002], b=[25.0008,121.5002];
const route=(coords=[a,b])=>({provider:'taipei-official',coordinates:coords,segmentPaths:[coords],crossingSegments:[],distance:67,steps:[]});
test('continuous same-side route passes with independent evidence marker',()=>{
 const r=createOfficialRouteVerifier(graph())(route(),a,b);assert.equal(r.error,undefined);assert.equal(r.geometryVerification,'official-polygons-and-crossings-v1');
});
test('official primary route crossing a car road without a crosswalk is rejected',()=>{
 const c=[25.0002,121.5008];assert.equal(createOfficialRouteVerifier(graph())(route([a,c]),a,c).error,'OFFICIAL_ROAD_CONFLICT');
});
test('whole crossing covered by official crossing polygon can pass',()=>{
 const g=graph(),c=[25.0002,121.5008];g.officialCrossingAreas=[box(121.5001,25.0001,121.5009,25.0003)];
 const r=route([a,c]);r.crossingSegments=[[a,c]];assert.equal(createOfficialRouteVerifier(g)(r,a,c).error,undefined);
});
test('crossing label does not replace full crossing polygon evidence',()=>{
 const g=graph(),c=[25.0002,121.5008];g.officialCrossingAreas=[box(121.50049,25.0001,121.50051,25.0003)];
 const r=route([a,c]);r.crossingSegments=[[a,c]];assert.equal(createOfficialRouteVerifier(g)(r,a,c).error,'OFFICIAL_CROSSING_UNVERIFIED');
});
test('a short entrance connector across a car road is rejected even under 5 metres',()=>{
 const s=[25.0002,121.50051],x=[25.0002,121.50049],y=[25.0003,121.50049];
 assert.equal(createOfficialRouteVerifier(graph())(route([x,y]),s,y).error,'OFFICIAL_ENTRY_UNVERIFIED');
});
test('zero-gap endpoint sitting on a car road is not exempt',()=>{
 const x=[25.0002,121.5005];assert.equal(createOfficialRouteVerifier(graph())(route([x,x]),x,x).error,'OFFICIAL_ROAD_CONFLICT');
});
test('route cannot follow a car centreline without a crossing polygon',()=>{
 const x=[25.0002,121.5005],y=[25.0008,121.5005];assert.equal(createOfficialRouteVerifier(graph())(route([x,y]),x,y).error,'OFFICIAL_ROAD_CONFLICT');
});
test('polygon gap in middle of official route is never bridged',()=>{
 const g=graph();g.officialAreas=[box(121.5001,25.0001,121.5003,25.0004),box(121.5001,25.0006,121.5003,25.0009)];
 assert.equal(createOfficialRouteVerifier(g)(route(),a,b).error,'OFFICIAL_PATH_UNVERIFIED');
});
test('covered short entrance connectors are included only after verification',()=>{
 const s=[25.00019,121.5002],r=createOfficialRouteVerifier(graph())(route(),s,b);assert.equal(r.error,undefined);assert.deepEqual(r.coordinates[0],s);
});
test('far snapping cannot be approved by entrance confirmation',()=>{
 const s=[25.0001,121.5002];assert.equal(createOfficialRouteVerifier(graph())({...route(),requiresEntryConfirmation:false},s,b).error,'OFFICIAL_ENTRY_UNVERIFIED');
});
test('missing evidence and non-finite geometry fail closed',()=>{
 assert.throws(()=>createOfficialRouteVerifier({...graph(),officialAreas:[]}));
 assert.equal(createOfficialRouteVerifier(graph())(route([[NaN,121.5],b]),a,b).error,'OFFICIAL_INVALID');
});

test('step geometry on a different unverified road is rejected even when display line is safe',()=>{
 const r=route();r.segmentPaths=[[[25.0002,121.5005],[25.0008,121.5005]]];
 assert.equal(createOfficialRouteVerifier(graph())(r,a,b).error,'OFFICIAL_PATH_UNVERIFIED');
});
