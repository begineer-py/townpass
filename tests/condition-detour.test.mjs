import test from 'node:test';
import assert from 'node:assert/strict';
import {createOfficialConditionIndex} from '../src/official-conditions.mjs';
import {createVerifiedRouter} from '../src/pedestrian-planning.mjs';
import {createLocalRouteVerifier} from '../src/local-route-verifier.mjs';
import {createConstructionChecker} from '../src/construction.mjs';
import {planConditionDetour} from '../src/official-condition-detour.mjs';
const n=(x,y)=>[25+y/111195,121.5+x/100700,0];
function setup(){
 const nodes=[n(0,0),n(200,0),n(0,100),n(200,100)],proof={schemaVersion:2,coverage:1,maxUncoveredMetres:0,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
 const area={type:'Polygon',coordinates:[[[121.49,24.99],[121.52,24.99],[121.52,25.02],[121.49,25.02],[121.49,24.99]]]};
 const graph={officialPathEvidence:{schemaVersion:2},officialAreas:[area],officialCrossingAreas:[],roadGeometries:[],nodes,ways:[{name:'人行道',highway:'footway',width:2,slope:0}],edges:[[0,1,200,0,[],proof],[0,2,100,0,[],proof],[2,3,200,0,[],proof],[3,1,100,0,[],proof]]};
 graph.officialConditionIndex=createOfficialConditionIndex({schemaVersion:1,fetchedAt:new Date().toISOString(),points:[{id:'42',type:'missing_noCurbSlope',lat:n(100,0)[0],lon:n(100,0)[1]}]});
 const verifyLocal=createLocalRouteVerifier(graph),router=createVerifiedRouter(graph,verifyLocal),stamp=new Date().toISOString(),snapshot={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]};
 const checker=createConstructionChecker(snapshot),start={name:'起',lat:nodes[0][0],lon:nodes[0][1]},end={name:'終',lat:nodes[1][0],lon:nodes[1][1]};
 return {graph,verifyLocal,router,snapshot,checker,start,end,facilities:[]};
}
test('avoids selected point by ten metres using a separately verified walk',()=>{
 const d=setup(),result=planConditionDetour(d.start,d.end,{},d.snapshot,d,[{type:'missing_noCurbSlope',id:'42',lat:n(100,0)[0],lon:n(100,0)[1]}]);
 assert.equal(result.error,undefined);assert.equal(result.distance,400);assert.equal(result.conditionDetour.radiusMetres,10);
 assert.equal(d.graph.officialConditionIndex.find(result.coordinates,10).some(p=>p.id==='42'),false);
 assert.equal(result.construction.blocked.length,0);
});
test('keeps failure explicit for missing target, stale construction and no alternative',()=>{
 const d=setup(),target={type:'missing_noCurbSlope',id:'42',lat:n(100,0)[0],lon:n(100,0)[1]};assert.equal(planConditionDetour(d.start,d.end,{},d.snapshot,d,[{...target,id:'404'}]).error,'OFFICIAL_CONDITION_UNAVAILABLE');
 assert.equal(planConditionDetour(d.start,d.end,{},d.snapshot,d,[{...target,lat:target.lat+.01}]).error,'OFFICIAL_CONDITION_UNAVAILABLE');
 const stale={...d.snapshot,sourceUpdatedAt:'2000-01-01T00:00:00Z'};assert.equal(planConditionDetour(d.start,d.end,{},stale,d,[target]).error,'CONSTRUCTION_UNAVAILABLE');
 d.graph.edges.splice(1);const verifyLocal=createLocalRouteVerifier(d.graph),router=createVerifiedRouter(d.graph,verifyLocal);
 assert.equal(planConditionDetour(d.start,d.end,{},d.snapshot,{...d,verifyLocal,router},[target]).error,'NO_CONDITION_DETOUR');
});
test('a second avoidance request continues to exclude the first selected point',()=>{
 const d=setup(),p=n(100,0),q=n(100,100),base={type:'missing_noCurbSlope'};
 d.graph.officialConditionIndex=createOfficialConditionIndex({schemaVersion:1,fetchedAt:new Date().toISOString(),points:[{...base,id:'42',lat:p[0],lon:p[1]},{...base,id:'43',lat:q[0],lon:q[1]}]});
 const verifyLocal=createLocalRouteVerifier(d.graph),router=createVerifiedRouter(d.graph,verifyLocal);
 const targets=[{...base,id:'42',lat:p[0],lon:p[1]},{...base,id:'43',lat:q[0],lon:q[1]}];
 assert.equal(planConditionDetour(d.start,d.end,{},d.snapshot,{...d,verifyLocal,router},targets).error,'NO_CONDITION_DETOUR');
});
