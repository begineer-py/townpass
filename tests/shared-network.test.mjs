import test from 'node:test';
import assert from 'node:assert/strict';
import {createRouter,edgeAllowed} from '../src/routing.mjs';
import {edgeTier,edgeCostFactor} from '../src/route-tiers.mjs';
const base={schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
const shared={...base,sharedRoad:true,sourceTopologyVerified:true,junctionsVerified:true,roadIntersectionsVerified:true,barriersVerified:true};
const way={highway:'living_street',source:'osm-shared-street',name:'共道',width:null,slope:null};
const n=(x,id,blocked=0)=>[25,121.5+x/100700,blocked,id];
test('only explicitly audited shared streets are routable',()=>{
 assert.equal(edgeAllowed(way,{},shared),true);
 assert.equal(edgeAllowed(way,{officialOnly:true},shared),false);
 assert.equal(edgeAllowed(way,{knownOnly:true},shared),false);
 for(const key of ['sharedRoad','sourceTopologyVerified','junctionsVerified','roadIntersectionsVerified','barriersVerified'])assert.equal(edgeAllowed(way,{}, {...shared,[key]:false}),false,key);
 for(const attrs of [{foot:'no'},{access:'private'},{wheelchair:'no'},{highway:'residential'},{bridge:'yes'}])assert.equal(edgeAllowed({...way,...attrs},{},shared),false);
 assert.equal(edgeAllowed({highway:'footway'}, {},shared),false);
 assert.equal(edgeTier(shared),'shared');
 assert.ok(edgeCostFactor(way,shared,{preferOfficial:false})>edgeCostFactor({width:null,slope:null},base,{preferOfficial:false}));
});
test('shared edge preserves geometry, warning and road percentage',()=>{
 const g={nodes:[n(0,1),n(100,2),n(200,3)],ways:[{name:'路',highway:'footway',width:null,slope:null}, {...way,name:'路'}],edges:[[0,1,100,0,[],base],[1,2,100,1,[],shared]],officialPathEvidence:{schemaVersion:2},roadGeometries:[],officialCrossingAreas:[]};
 const route=createRouter(g)(g.nodes[0].slice(0,2),g.nodes[2].slice(0,2),{approachAllowed:(a,b)=>a[0]===b[0]&&a[1]===b[1]});
 assert.equal(route.error,undefined);assert.equal(route.roadPct,50);assert.equal(route.steps.length,2);assert.equal(route.steps[1].sharedRoad,true);assert.equal(route.tierSegments[1].sharedRoad,true);assert.deepEqual(route.tierSegments[1].coordinates,[g.nodes[1].slice(0,2),g.nodes[2].slice(0,2)]);
});
