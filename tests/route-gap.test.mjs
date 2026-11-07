import test from 'node:test';
import assert from 'node:assert/strict';
import {createRouter,metres} from '../src/routing.mjs';
import {diagnoseRouteGap} from '../src/route-gap.mjs';

const node=(x,id,blocked=0)=>[25,121.5+x/100700,blocked,id];
const proof={schemaVersion:2,coverage:0,maxUncoveredMetres:10,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
function network(){return {officialPathEvidence:{schemaVersion:2},roadGeometries:[],officialCrossingAreas:[],nodes:[node(0,1),node(10,2),node(30,3),node(40,4)],ways:[{highway:'footway',name:'路',width:2,slope:0}],edges:[[0,1,10,0,[],proof],[2,3,10,0,[],proof]]};}
const exact=(a,b)=>metres(a,b)<.001;
test('complete NO_ROUTE finds real reachable points on both sides without fabricating a line',()=>{
 const g=network(),r=createRouter(g)(g.nodes[0].slice(0,2),g.nodes[3].slice(0,2),{approachAllowed:exact,diagnoseGap:true});
 assert.equal(r.error,'NO_ROUTE');assert.equal(r.routeGap.status,'candidate');
 assert.deepEqual(r.routeGap.startSide,g.nodes[1].slice(0,2));assert.deepEqual(r.routeGap.endSide,g.nodes[2].slice(0,2));
 assert.equal(r.routeGap.straightMetres,20);assert.equal(r.coordinates,undefined);assert.equal(r.routeGap.coordinates,undefined);
});
test('NO_CONNECTION does not pretend to identify a middle gap',()=>{
 const g=network(),r=createRouter(g)(node(-80,8).slice(0,2),g.nodes[3].slice(0,2),{approachAllowed:exact,diagnoseGap:true});
 assert.equal(r.error,'NO_CONNECTION');assert.equal(r.routeGap,undefined);
});
test('construction-rejected edges are not traversed in the reverse reachability search',()=>{
 const g=network();g.edges.splice(1,0,[1,2,20,0,[],proof]);
 const work=line=>!(line.some(p=>Math.abs(p[1]-g.nodes[1][1])<1e-9)&&line.some(p=>Math.abs(p[1]-g.nodes[2][1])<1e-9));
 const r=createRouter(g)(g.nodes[0].slice(0,2),g.nodes[3].slice(0,2),{approachAllowed:exact,lineAllowed:work,diagnoseGap:true});
 assert.equal(r.error,'NO_ROUTE');assert.deepEqual(r.routeGap.startSide,g.nodes[1].slice(0,2));assert.deepEqual(r.routeGap.endSide,g.nodes[2].slice(0,2));
});
test('unusable grades, blocked nodes, and work limits do not produce invented locations',()=>{
 const g=network(),adj=[[[1,0]],[[0,0]],[[3,1]],[[2,1]]],dist=new Float64Array([0,10,Infinity,Infinity]);
 assert.equal(diagnoseRouteGap({graph:g,adjacency:adj,forwardDist:dist,ends:[{index:3}],canTraverse:()=>true,groundEdge:()=>false}).status,'unavailable');
 g.nodes[2][2]=1;g.nodes[3][2]=1;
 assert.equal(diagnoseRouteGap({graph:g,adjacency:adj,forwardDist:dist,ends:[{index:3}],canTraverse:()=>true,groundEdge:()=>true}).status,'unavailable');
 assert.equal(diagnoseRouteGap({graph:network(),adjacency:adj,forwardDist:dist,ends:[{index:3}],canTraverse:()=>true,groundEdge:()=>true,maxComparisons:0}).status,'unavailable');
});
