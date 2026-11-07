import test from 'node:test';import assert from 'node:assert/strict';
import{createRouter,edgeAllowed,SNAP_METRES}from'../src/routing.mjs';
const n=(x,y)=>[25+y/111195,121.5+x/100700,0];
const proof=(coverage=1)=>({schemaVersion:2,coverage,maxUncoveredMetres:coverage?0:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true});
const w={highway:'footway',width:2,slope:0};
test('1.8 tier chooses a longer official path when its total weighted cost is lower',()=>{
 const g={officialPathEvidence:{schemaVersion:2},nodes:[n(0,0),n(40,0),n(20,20)],ways:[w],edges:[[0,1,40,0,[],proof(0)],[0,2,22,0,[],proof()],[2,1,23,0,[],proof()]]};const r=createRouter(g)(g.nodes[0],g.nodes[1]);assert.equal(r.distance,45);assert.ok(r.tierSegments.every(s=>s.tier==='official'));assert.equal(createRouter(g)(g.nodes[0],g.nodes[1],{preferOfficial:false}).distance,40);
});
test('multiple endpoint search scores approach distance and route cost jointly',()=>{
 const g={officialPathEvidence:{schemaVersion:2},nodes:[n(0,5),n(0,20),n(100,0)],ways:[w],edges:[[0,2,100,0,[],proof(0)],[1,2,102,0,[],proof()]],roadGeometries:[],officialCrossingAreas:[]};const r=createRouter(g)(n(0,0),g.nodes[2]);assert.equal(r.error,undefined);assert.ok(r.startGap>10);assert.ok(r.weightedCost<190);
});
test('50m snapping projects onto the actual middle of a long mapped segment',()=>{
 const g={officialPathEvidence:{schemaVersion:2},nodes:[n(0,0),n(300,0)],ways:[w],edges:[[0,1,300,0,[],proof()]],roadGeometries:[],officialCrossingAreas:[]};const r=createRouter(g)(n(100,2),n(200,2));assert.equal(SNAP_METRES,50);assert.equal(r.error,undefined);assert.ok(r.distance<105&&r.distance>95);assert.equal(r.startGap,2);assert.ok(r.edgeIds.every(i=>g.edges[i][5].derivedFrom===0));
});
test('bridge sidewalk requires grade evidence; arbitrary bridges and stairs stay excluded',()=>{
 const b={...w,bridge:'yes',footway:'sidewalk',layer:'1',gradeSeparatedPedestrian:true};assert.equal(edgeAllowed(b,{},proof()),false);assert.equal(edgeAllowed(b,{}, {...proof(),gradeSeparatedPedestrian:true}),true);assert.equal(edgeAllowed({...b,highway:'steps'},{},{...proof(),gradeSeparatedPedestrian:true}),false);
});

test('a connector requires complete supporting proof and never becomes a normal footway by weighting',()=>{
 const way={...w,isConnector:true,source:'official-polygon-connector'};
 assert.equal(edgeAllowed(way,{},proof()),false);
 assert.equal(edgeAllowed(way,{}, {...proof(),connectorVerified:true,connectorLength:2}),true);
 assert.equal(edgeAllowed(way,{}, {...proof(),connectorVerified:true,connectorLength:4}),false);
});

import {validateNetwork} from '../src/network-contract.mjs';
test('grade-separated evidence requires original node identities in exported data',()=>{
 const b={...w,bridge:'yes',footway:'sidewalk',layer:'1',gradeSeparatedPedestrian:true};
 const g={officialPathEvidence:{schemaVersion:2},nodes:[n(0,0),n(10,0)],ways:[b],edges:[[0,1,10,0,[],{...proof(),gradeSeparatedPedestrian:true}]],officialAreas:[{}],officialCrossingAreas:[],roadGeometries:[[[121.5,25],[121.6,25]]]};
 assert.throws(()=>validateNetwork(g),/MISSING_GRADE_NODE_IDENTITY/);
 g.nodeIdentity='OSM node ID; coincident coordinates do not create connectivity';g.nodes[0].push(100);g.nodes[1].push(200);assert.equal(validateNetwork(g),true);
});
