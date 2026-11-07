import test from 'node:test';
import assert from 'node:assert/strict';
import {officialConditionCostFactor,restoreOfficialConditionCost} from '../src/official-condition-cost.mjs';
import {createOfficialConditionIndex} from '../src/official-conditions.mjs';
import {createRouter} from '../src/routing.mjs';

const n=(x,y=0)=>[25+y/111195,121.5+x/100700];
const p=(x,y=0,activity='活動區域分類-高')=>({lat:n(x,y)[0],lon:n(x,y)[1],type:'missing_noCurbSlope',activity});
const cost=(a,b,points)=>officialConditionCostFactor([n(a),n(b)],points)*Math.abs(b-a);

test('local cost is symmetric and unchanged when a path is split at an observation',()=>{
 const points=[p(50)];
 const full=cost(0,100,points),split=cost(0,50,points)+cost(50,100,points),reverse=cost(100,0,points);
 assert.ok(Math.abs(full-2.1)<1e-5);assert.ok(Math.abs(full-split)<1e-5);assert.ok(Math.abs(full-reverse)<1e-5);
 assert.equal(officialConditionCostFactor([n(0),n(0)],points),0);
});
test('clipping uses distance to actual route and caps overlapping local costs',()=>{
 assert.equal(cost(0,100,[p(50,3)]),0);
 assert.ok(cost(0,100,[p(50,1)])<cost(0,100,[p(50,0)]));
 assert.ok(Math.abs(cost(0,100,Array.from({length:30},(_,i)=>({...p(50),id:String(i)})))-8)<1e-5);
 const many=Array.from({length:30},()=>p(50));
 assert.ok(Math.abs(cost(0,100,many)-cost(0,50,many)-cost(50,100,many))<1e-5);
});
test('restoring the official preference matches search cost with optimiser and avoid-point multipliers',()=>{
 const index=createOfficialConditionIndex({schemaVersion:1,fetchedAt:'2026-11-08',points:[{...p(50),id:'a'}]});
 const graph={officialPathEvidence:{schemaVersion:2},nodes:[n(0),n(100)],ways:[{highway:'path',width:2,slope:0}],edges:[[0,1,100,0,[],{schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true}]],officialAreas:[],officialCrossingAreas:[],roadGeometries:[],officialConditionIndex:index};
 const router=createRouter(graph),prefs={_optimizeNonSidewalkPenalty:2,avoidPoints:[n(50)],approachAllowed:(a,b)=>a[0]===b[0]&&a[1]===b[1]};
 const normal=router(n(0),n(100),prefs),baseline=router(n(0),n(100),{...prefs,_ignoreOfficialConditions:true});
 const restored=restoreOfficialConditionCost(graph,baseline,prefs);
 assert.ok(Math.abs(restored.weightedCost-normal.weightedCost)<1e-6);
 assert.ok(Math.abs(restored.costBreakdown.officialCondition-normal.costBreakdown.officialCondition)<1e-6);
 assert.ok(Math.abs(restored.costBreakdown.avoidPoint-normal.costBreakdown.avoidPoint)<1e-6);
 assert.ok(restored.weightedCost>Object.values(restored.costBreakdown).reduce((a,b)=>a+b,0));
});
