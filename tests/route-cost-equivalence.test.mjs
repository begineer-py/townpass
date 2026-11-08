import test from 'node:test';
import assert from 'node:assert/strict';
import {edgeCostDetails,edgeCostFactor} from '../src/route-tiers.mjs';

test('allocation-free edge costs exactly match the detailed scoring for all combinations',()=>{
 const widths=[null,undefined,0,.8,1.2,1.5,2,NaN],slopes=[null,undefined,0,3,-6,NaN],surfaces=[null,'paved','gravel','dirt'];
 const proofs=[{coverage:1,maxUncoveredMetres:0},{coverage:0,maxUncoveredMetres:1},{sharedRoad:true},{connectorVerified:true}];
 const options=[{}, {mode:'gentle'}, {mode:'crossings'}, {minWidth:1.5}, {preferOfficial:false}];
 for(const width of widths)for(const slope of slopes)for(const surface of surfaces)for(const proof of proofs)for(const option of options)for(const crossing of [false,true]){
  const way={highway:'footway',footway:'sidewalk',width,slope,surface,crossing};
  const expected=Object.values(edgeCostDetails(way,proof,option)).reduce((sum,value)=>sum+value,0);
  assert.ok(Object.is(edgeCostFactor(way,proof,option),expected),JSON.stringify({way,proof,option,expected}));
 }
});
