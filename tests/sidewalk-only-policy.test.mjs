import test from 'node:test';
import assert from 'node:assert/strict';
import {createRouter, edgeAllowed} from '../src/routing.mjs';
import {createLocalRouteVerifier} from '../src/local-route-verifier.mjs';
const proof={schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
const shared={...proof,sharedRoad:true,sourceTopologyVerified:true,junctionsVerified:true,roadIntersectionsVerified:true,barriersVerified:true};
const n=(x,y)=>[25+y/111195,121.5+x/100700,0];
test('road centrelines are rejected even with shared-road topology evidence and preferences',()=>{
 for(const highway of ['living_street','residential','unclassified','service']) {
  const way={highway,source:'osm-shared-street'};
  for(const options of [{},{officialOnly:false},{avoidSteps:false},{_optimizeSharedPenalty:0}]) assert.equal(edgeAllowed(way,options,shared),false,highway);
 }
 assert.equal(edgeAllowed({highway:'footway'}, {},shared),false);
});
test('route uses the connected pedestrian detour even if much longer; forged shared geometry is rejected',()=>{
 const nodes=[n(0,0),n(100,0),n(0,100),n(100,100)];
 const g={nodes,ways:[{highway:'residential',source:'osm-shared-street'},{highway:'footway'}],edges:[[0,1,100,0,[],shared],[0,2,100,1,[],proof],[2,3,100,1,[],proof],[3,1,100,1,[],proof]],officialPathEvidence:{schemaVersion:2},roadGeometries:[],officialAreas:[],officialCrossingAreas:[]};
 const a=nodes[0].slice(0,2),b=nodes[1].slice(0,2),r=createRouter(g)(a,b,{approachAllowed:(x,y)=>x[0]===y[0]&&x[1]===y[1]});
 assert.equal(r.error,undefined);assert.equal(r.distance,300);assert.deepEqual(r.edgeIds,[1,2,3]);
 const forged={...r,edgeIds:[0],nodeIds:[0,1],coordinates:[a,b]};
 assert.equal(createLocalRouteVerifier(g)(forged,a,b).error,'UNVERIFIED_NETWORK');
 g.edges=g.edges.slice(0,1);
 assert.ok(createRouter(g)(a,b,{approachAllowed:(x,y)=>x[0]===y[0]&&x[1]===y[1]}).error);
});
