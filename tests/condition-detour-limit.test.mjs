import test from 'node:test';
import assert from 'node:assert/strict';
import {planPlaces} from '../src/local-route-verifier.mjs';
import {createLocalRouteVerifier} from '../src/local-route-verifier.mjs';
import {createRouter} from '../src/routing.mjs';
import {createOfficialConditionIndex} from '../src/official-conditions.mjs';
import {createConstructionChecker} from '../src/construction.mjs';

const start={lat:25,lon:121.5},end={lat:25.01,lon:121.51};
const fresh=()=>{const stamp=new Date().toISOString();return {schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]};};
function setup({normal=131,baseline=100,rejectBaseline=false,blockBaseline=false,baselineError=false,withIndex=true}={}){
 const calls=[],checks=[];
 const checker={allowed:()=>true,inspect:coords=>({blocked:blockBaseline&&coords[0][0]===1?[{id:'work'}]:[],sourceUpdatedAt:'now'})};
 const router=(a,b,prefs)=>{calls.push({a,b,prefs});if(prefs._ignoreOfficialConditions&&baselineError)return {error:'NO_ROUTE'};
  const base=prefs._ignoreOfficialConditions;return {distance:base?baseline:normal,weightedCost:base?baseline:normal,edgeIds:[0],coordinates:[[base?1:2,0],[3,0]],routeKind:base?'baseline':'normal'};};
 const verifyLocal=(route,a,b,prefs)=>{checks.push({route,a,b,prefs});return rejectBaseline&&route.routeKind==='baseline'?{error:'UNVERIFIED_NETWORK'}:route;};
 verifyLocal.approachAllowed=()=>true;
 const graph=withIndex?{officialConditionIndex:{find:()=>[]},nodes:[[25,121.5],[25,121.501]],ways:[{highway:'footway'}],edges:[[0,1,100,0,[]]]}:{};
 return {calls,checks,checker,deps:{graph,router,verifyLocal,facilities:[],checker}};
}
test('only verified routes within both distance limits benefit from official record preference',()=>{
 for(const [normal,baseline,kind,applied] of [[129,100,'normal',false],[131,100,'baseline',true],[2300,2000,'normal',false],[2301,2000,'baseline',true]]){
  const s=setup({normal,baseline}),out=planPlaces(start,end,{mode:'gentle',avoidSteps:true},fresh(),s.deps);
  assert.equal(out.routeKind,kind);assert.equal(out.conditionDetourLimit.applied,applied);
  assert.equal(out.conditionDetourLimit.maxDistanceMetres,Math.min(baseline*1.3,baseline+300));
  assert.equal(s.calls.length,2);assert.deepEqual(s.calls.map(c=>c.prefs._ignoreOfficialConditions),[false,true]);
  assert.equal(out.conditionDetourLimit.baselineOfficialConditionWeight,null);
  assert.deepEqual(s.calls[0].a,s.calls[1].a);assert.deepEqual(s.calls[0].b,s.calls[1].b);
  assert.ok(s.calls.every(c=>c.prefs.lineAllowed===s.checker.allowed&&c.prefs.mode==='gentle'&&c.prefs.avoidSteps));
  assert.equal(s.checks.length,2);
 }
});
test('never substitute an unverified, blocked, missing or expired baseline',()=>{
 for(const input of [{rejectBaseline:true},{blockBaseline:true},{baselineError:true}]){
  const s=setup(input);assert.equal(planPlaces(start,end,{},fresh(),s.deps).routeKind,'normal');
 }
 const s=setup({withIndex:false});assert.equal(planPlaces(start,end,{},fresh(),s.deps).routeKind,'normal');assert.equal(s.calls.length,1);
 const t=setup(),old={...fresh(),sourceUpdatedAt:'2020-01-01T00:00:00Z'};assert.equal(planPlaces(start,end,{},old,t.deps).error,'CONSTRUCTION_UNAVAILABLE');
 const expired=setup();assert.equal(planPlaces(start,end,{_optimizeDeadline:Date.now()-1},fresh(),expired.deps).routeKind,'normal');assert.equal(expired.checks.length,1);
});
test('real router keeps verified short road when observations would cause a detour over the cap',()=>{
 const node=(x,y)=>[25+y/111195,121.5+x/100700,0];
 const a=node(0,0),b=node(100,0),via=node(50,45),now=fresh();
 const proof={schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
 const points=Array.from({length:48},(_,i)=>({id:String(i),type:'missing_noCurbSlope',lat:25,lon:node(2*i+3,0)[1],activity:'活動區域分類-高'}));
 const graph={nodes:[a,b,via],ways:[{highway:'footway',footway:'sidewalk',width:2,slope:0,surface:'paved'}],edges:[[0,1,100,0,[],proof],[0,2,67.3,0,[],proof],[2,1,67.3,0,[],proof]],officialPathEvidence:{schemaVersion:2},officialAreas:[],officialCrossingAreas:[],roadGeometries:[],officialConditionIndex:createOfficialConditionIndex({schemaVersion:1,fetchedAt:now.fetchedAt,points})};
 const router=createRouter(graph),verifyLocal=createLocalRouteVerifier(graph),checker=createConstructionChecker(now);
 const result=planPlaces({lat:a[0],lon:a[1]},{lat:b[0],lon:b[1]}, {},now,{graph,router,verifyLocal,facilities:[],checker});
 assert.equal(result.error,undefined);assert.equal(result.distance,100);assert.equal(result.conditionDetourLimit.applied,true);
 assert.equal(result.geometryVerification,'pedestrian-network-v1');assert.ok(result.officialConditions.points.length>0);assert.ok(result.conditionDetourLimit.baselineOfficialConditionWeight>0);
});
test('entrance selection compares the route actually returned under the same cost policy',()=>{
 const node=x=>[25,121.5+x/100700],a=node(0),b=node(100);
 const startStation={kind:'station',name:'測試站',lat:a[0],lon:a[1]},endPlace={lat:b[0],lon:b[1]};
 const facilities=[{id:'first',kind:'metro-elevator',station:'測試',lat:a[0],lon:a[1]},{id:'second',kind:'metro-elevator',station:'測試',lat:a[0],lon:a[1]+0.000001}];
 const verifyLocal=route=>route;verifyLocal.approachAllowed=()=>true;
 const checker={allowed:()=>true,inspect:()=>({blocked:[]})};
 for(const many of [false,true]){
  const points=many?Array.from({length:50},(_,i)=>({type:'missing_noCurbSlope',activity:'活動區域分類-高',lat:25,lon:node(i*2+1)[1]})):[];
  const graph={officialConditionIndex:{find:()=>points},nodes:[a,b],ways:[{highway:'footway'}],edges:[[0,1,100,0,[]]]};
  const router=(start,end,prefs)=>{const first=prefs.startPlace.id==='first',base=prefs._ignoreOfficialConditions;
   return {edgeIds:[0],distance:first&&!base?140:100,weightedCost:first?(base?100:140):150,coordinates:[a,b]};};
  const result=planPlaces(startStation,endPlace,{},fresh(),{graph,facilities,verifyLocal,checker,router});
  assert.equal(result.resolvedStart.id,many?'second':'first');
  if(!many){assert.equal(result.conditionDetourLimit.applied,true);assert.equal(result.weightedCost,100);}
  else assert.equal(result.weightedCost,150);
 }
});
