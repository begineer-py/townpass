import test from 'node:test';
import assert from 'node:assert/strict';
import {createRouter} from '../src/routing.mjs';
import {createLocalRouteVerifier} from '../src/local-route-verifier.mjs';
import {projectionLimitResponse} from '../src/route-worker-errors.mjs';

function fixture(count){
 const nodes=[],edges=[],proof={schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
 for(let i=0;i<count;i++){
  const lat=25+Math.floor(i/80)*.002,lon=121.42+(i%80)*.003;
  nodes.push([lat,lon,0,i*2+1],[lat,lon+140/100700,0,i*2+2]);edges.push([i*2,i*2+1,140,0,[],proof]);
 }
 return {nodes,edges,ways:[{highway:'footway',width:2,slope:0}],officialPathEvidence:{schemaVersion:2},officialAreas:[],officialCrossingAreas:[],roadGeometries:[]};
}
const exact={approachAllowed:(a,b)=>Math.hypot((a[0]-b[0])*111195,(a[1]-b[1])*100700)<.001};
function points(g,i){const a=g.nodes[i*2],b=g.nodes[i*2+1];return [[a[0],(a[1]+b[1])/2],a.slice(0,2)];}

test('task-boundary cleanup recovers projections and rejects stale derived provenance',()=>{
 const g=fixture(1025),last=g.nodes[1],extra=g.nodes.length;g.nodes.push([last[0],last[1]+140/100700,0,99999]);g.edges.push([1,extra,140,0,[],g.edges[0][5]]);
 const originalNodes=g.nodes.length,originalEdges=g.edges.length,router=createRouter(g),verify=createLocalRouteVerifier(g);
 const [start]=points(g,0),end=g.nodes[extra].slice(0,2),old=router(start,end,exact);assert.equal(old.error,undefined);assert.equal(verify(old,start,end,exact).error,undefined);
 assert.ok(old.edgeIds.some(id=>id<originalEdges)&&old.edgeIds.some(id=>id>=originalEdges));
 for(let i=1;i<1024;i++){const [a,b]=points(g,i);assert.equal(router(a,b,exact).error,undefined);}
 // No implicit cleanup has occurred while the current task is using IDs.
 assert.equal(verify(old,start,end,exact).error,undefined);
 assert.equal(router.resetProjectionsIfNeeded(),true);assert.equal(g.nodes.length,originalNodes);assert.equal(g.edges.length,originalEdges);
 const current=router(start,end,exact);assert.equal(current.error,undefined);assert.notEqual(current.projectionEpoch,old.projectionEpoch);
 // The same numerical edge IDs and geometry are reused; epoch still rejects an old route.
 assert.equal(verify(old,start,end,exact).error,'UNVERIFIED_NETWORK');assert.equal(verify(current,start,end,exact).error,undefined);
 const other=points(g,1024);assert.equal(router(...other,exact).error,undefined);assert.equal(router.resetProjectionsIfNeeded(),false);
 // Legacy routes using only original edges remain verifiable.
 const a=g.nodes[2046].slice(0,2),b=g.nodes[2047].slice(0,2),staticRoute=router(a,b,exact);delete staticRoute.projectionEpoch;
 assert.equal(verify(staticRoute,a,b,exact).error,undefined);
});

test('graph ownership prevents a second router invalidating live derived IDs',()=>{
 const g=fixture(1),router=createRouter(g),[start,end]=points(g,0),route=router(start,end,exact),verify=createLocalRouteVerifier(g);
 assert.throws(()=>createRouter(g),/derived projections/);assert.equal(verify(route,start,end,exact).error,undefined);
 const originalEdges=g.edges;g.edges=[...g.edges];
 assert.throws(()=>createRouter(g),/derived projections/);
 g.edges=originalEdges;assert.equal(verify(route,start,end,exact).error,undefined);
});
test('shallow graph clones cannot share live projection arrays or truncate one another',()=>{
 const a=fixture(1),b={...a},first=createRouter(a),second=createRouter(b),[start,end]=points(a,0);
 const result=first(start,end,exact),verify=createLocalRouteVerifier(a);assert.equal(verify(result,start,end,exact).error,undefined);
 assert.equal(second(start,end,exact).error,'UNVERIFIED_NETWORK');
 assert.throws(()=>second.resetProjectionsIfNeeded(),/graph was replaced/);
 assert.throws(()=>createRouter({...a}),/share graph arrays/);
 assert.equal(verify(result,start,end,exact).error,undefined);
});
test('a copied graph cannot reinterpret an old derived edge as permanent provenance',()=>{
 const original=fixture(1),router=createRouter(original),[start,end]=points(original,0),old=router(start,end,exact);
 const copied=structuredClone(original),freshRouter=createRouter(copied),verify=createLocalRouteVerifier(copied);
 assert.equal(verify(old,start,end,exact).error,'UNVERIFIED_NETWORK');
 const current=freshRouter(start,end,exact);assert.equal(verify(current,start,end,exact).error,undefined);
});

test('recreating a projection-free router reindexes changed ways, and condition cache follows source replacement',()=>{
 const g=fixture(1),[start,end]=points(g,0);g.ways[0].highway='primary';
 const first=createRouter(g);assert.equal(first(start,end,exact).error,'NO_CONNECTION');
 g.ways[0].highway='footway';const second=createRouter(g);
 assert.equal(first(start,end,exact).error,undefined);assert.equal(second(start,end,exact).error,undefined);
 const a=g.nodes[0].slice(0,2),b=g.nodes[1].slice(0,2),point={lat:a[0],lon:(a[1]+b[1])/2,type:'missing_noCurbSlope'};
 g.officialConditionIndex={find:()=>[point]};const weighted=second(a,b,exact);assert.ok(weighted.costBreakdown.officialCondition>0);
 g.officialConditionIndex={find:()=>[]};const updated=second(a,b,exact);assert.equal(updated.costBreakdown.officialCondition,0);
});

test('a single task that exhausts capacity reports a limit, never a false no-connection',()=>{
 const g=fixture(2049),router=createRouter(g),verify=createLocalRouteVerifier(g);
 let last;for(let i=0;i<2048;i++){const [a,b]=points(g,i);last=router(a,b,exact);assert.equal(last.error,undefined);}
 const [previousStart,previousEnd]=points(g,2047);assert.equal(verify(last,previousStart,previousEnd,exact).error,undefined);
 assert.throws(()=>router(...points(g,2048),exact),error=>error.code==='PROJECTION_LIMIT');
 assert.equal(verify(last,previousStart,previousEnd,exact).error,undefined);
 assert.ok(g.nodes.length<=2049*2+2048);assert.ok(g.edges.length<=2049+16384);
 assert.equal(router.resetProjectionsIfNeeded(),true);
 assert.equal(router(...points(g,2048),exact).error,undefined);
});
test('capacity errors use the response type expected by every worker client',()=>{
 for(const [request,response] of [['nearby-positions','nearby-positions'],['avoid-official-condition','avoid-official-condition'],['verify-official','verified-official'],['plan-places','route'],['route','route']]){
  assert.deepEqual(projectionLimitResponse(request,7),{type:response,id:7,result:{error:'PROJECTION_LIMIT'}});
 }
});
