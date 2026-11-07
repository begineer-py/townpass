import test from 'node:test';import assert from 'node:assert/strict';
import{createRouter,edgeAllowed,SNAP_METRES}from'../src/routing.mjs';
import{edgeCostFactor}from'../src/route-tiers.mjs';
const n=(x,y)=>[25+y/111195,121.5+x/100700,0];
const proof=(coverage=1)=>({schemaVersion:2,coverage,maxUncoveredMetres:coverage?0:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true});
const w={highway:'footway',width:2,slope:0};
test('map segments split at changes in width, slope and recorded rough surface',()=>{
 const ways=[{...w,name:'同一條路'}, {...w,name:'同一條路',width:null}, {...w,name:'同一條路',slope:null}, {...w,name:'同一條路',surface:'gravel'}];
 const nodes=[0,10,20,30,40,50].map(x=>n(x,0));
 const edges=[[0,1,10,0,[],proof()],[1,2,10,1,[],proof()],[2,3,10,2,[],proof()],[3,4,10,3,[],proof()],[4,5,10,3,[],proof()]];
 const route=createRouter({officialPathEvidence:{schemaVersion:2},nodes,ways,edges})(nodes[0],nodes[5]);
 assert.equal(route.error,undefined);
 assert.deepEqual(route.tierSegments.map(s=>[s.tier,s.unknownWidth,s.unknownSlope,s.roughSurface,s.distance]),[
  ['official',false,false,false,10], ['official',true,false,false,10],
  ['official',false,true,false,10], ['official',false,false,true,20],
 ]);
 assert.ok(route.steps.some(s=>s.unknown));
 assert.ok(route.steps.some(s=>s.roughSurface));
 assert.equal(route.tierSegments.reduce((sum,s)=>sum+s.distance,0),50);
});
test('weighted route explains penalties without claiming a safety score',()=>{
 const way={highway:'footway',width:null,slope:6,surface:'gravel'};
 const graph={officialPathEvidence:{schemaVersion:2},nodes:[n(0,0),n(100,0)],ways:[way],edges:[[0,1,100,0,[],proof(0)]]};
 const route=createRouter(graph)(graph.nodes[0],graph.nodes[1],{mode:'gentle',avoidPoints:[n(50,0)]});
 assert.equal(route.error,undefined);
 assert.equal(route.unknownWidthMetres,100);
 assert.equal(route.unknownSlopeMetres,0);
 assert.equal(route.costBreakdown.source,80);
 assert.equal(route.costBreakdown.unknown,92);
 assert.equal(route.costBreakdown.surface,200);
 assert.equal(route.costBreakdown.slope,100);
 assert.ok(route.costBreakdown.avoidPoint>0);
 assert.ok(Math.abs(Object.values(route.costBreakdown).reduce((a,b)=>a+b,0)-route.weightedCost)<1e-8);
 assert.equal(route.safetyScore,undefined);
});
test('known width and slope win against an equally long unknown walking segment',()=>{
 const ways=[{...w,width:null,slope:null},w];
 const graph={officialPathEvidence:{schemaVersion:2},nodes:[n(0,0),n(100,0)],ways,edges:[[0,1,100,0,[],proof()],[0,1,100,1,[],proof()]]};
 const route=createRouter(graph)(graph.nodes[0],graph.nodes[1]);
 assert.deepEqual(route.edgeIds,[1]);
 assert.equal(route.unknownWidthMetres,0);
 assert.equal(route.unknownSlopeMetres,0);
});
test('a wider known path can be preferred even when it is longer',()=>{
 const ways=[{...w,width:1},{...w,width:1.5}];
 const graph={officialPathEvidence:{schemaVersion:2},nodes:[n(0,0),n(50,30),n(100,0)],ways,edges:[[0,2,100,0,[],proof()],[0,1,60,1,[],proof()],[1,2,60,1,[],proof()]]};
 const route=createRouter(graph)(graph.nodes[0],graph.nodes[2],{minWidth:.9});
 assert.deepEqual(route.edgeIds,[1,2]);
 assert.equal(route.distance,120);
 assert.equal(route.costBreakdown.width,0);
 assert.equal(edgeAllowed({...w,width:.89},{minWidth:.9},proof()),false);
});
test('width cost changes smoothly for known passable paths',()=>{
 const opts={minWidth:.9},p=proof();
 const cost=width=>edgeCostFactor({...w,width},p,opts);
 assert.ok(cost(.9)>cost(1));
 assert.ok(cost(1)>cost(1.25));
 assert.ok(cost(1.25)>cost(1.5));
 assert.equal(cost(1.5),cost(2));
});
test('unknown width does not beat a known passable narrow width on uncertainty alone',()=>{
 const opts={minWidth:.9},p=proof();
 assert.ok(edgeCostFactor({...w,width:null},p,opts)>edgeCostFactor({...w,width:.9},p,opts));
});
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

test('endpoint approach can use a later official crossing without relaxing road safety',()=>{
 const crossing={type:'Polygon',coordinates:[[[121.5002,25.00004],[121.5003,25.00004],[121.5003,25.00006],[121.5002,25.00006],[121.5002,25.00004]]]};
 const area={type:'Polygon',coordinates:[[[121.499,24.999],[121.502,24.999],[121.502,25.001],[121.499,25.001],[121.499,24.999]]]};
 const g={officialPathEvidence:{schemaVersion:2},officialAreas:[area],officialCrossingAreas:[],roadGeometries:[[[121.499,25.00005],[121.502,25.00005]]],nodes:[[25,121.5,0],[25,121.5005,0]],ways:[w],edges:[[0,1,50,0,[],proof()]],supplementalEvidence:{schemaVersion:1,sources:[{id:'marked-sidewalk-2026'}],features:[{sourceId:'marked-sidewalk-2026',crossing:true,geometry:crossing}]}};
 const start=[25.0001,121.50025],end=[25,121.5005];
 assert.equal(createRouter(structuredClone(g))(start,end).error,undefined);
 delete g.supplementalEvidence;
 assert.equal(createRouter(g)(start,end).error,'NO_CONNECTION');
});
