import test from 'node:test';
import assert from 'node:assert/strict';
import {createNearbyConditionAnnotator} from '../src/route-nearby-conditions.mjs';
import {createOfficialConditionIndex} from '../src/official-conditions.mjs';

test('nearby observations mark only nearby pieces and preserve verified route attributes', () => {
  const a=[25,121.5], b=[25,121.501];
  const index=createOfficialConditionIndex({schemaVersion:1,fetchedAt:'2026-11-08',points:[{type:'missing_noCurbSlope',id:'1',lat:25,lon:121.5005}]});
  const annotate=createNearbyConditionAnnotator(index);
  const input={tierSegments:[{coordinates:[a,b],distance:100,explicitSidewalk:true,sharedRoad:false}]};
  const result=annotate(input);
  assert.ok(result.tierSegments.some(s=>s.nearbyOfficialCondition===true));
  assert.ok(result.tierSegments.some(s=>s.nearbyOfficialCondition===false));
  assert.ok(result.tierSegments.every(s=>s.explicitSidewalk===true));
  assert.ok(Math.abs(result.tierSegments.reduce((n,s)=>n+s.distance,0)-100)<1e-6);
  assert.deepEqual(input.tierSegments[0].coordinates,[a,b]);
  assert.deepEqual(annotate(result).tierSegments.map(s=>s.nearbyOfficialCondition),result.tierSegments.map(s=>s.nearbyOfficialCondition));
});

test('missing dataset remains unknown instead of reporting no nearby records', () => {
  const annotate=createNearbyConditionAnnotator(null);
  const result=annotate({tierSegments:[{coordinates:[[25,121.5],[25,121.50001]],distance:1}]});
  assert.equal(result.tierSegments[0].nearbyOfficialCondition,null);
  assert.deepEqual(annotate({error:'NO_ROUTE'}),{error:'NO_ROUTE'});
});
