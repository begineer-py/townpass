import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUTE_CONDITIONS, conditionForSegment, fallbackRouteCondition } from '../src/route-conditions.mjs';
import { stepConditions } from '../src/format.mjs';

test('route display keeps unknown data distinct from known dimensions', () => {
  assert.equal(conditionForSegment({unknownWidth:false,unknownSlope:false,roughSurface:false}), 'known');
  assert.equal(conditionForSegment({unknownWidth:true,unknownSlope:false,roughSurface:false}), 'unknown');
  assert.equal(conditionForSegment({unknownWidth:false,unknownSlope:true,roughSurface:false}), 'unknown');
  assert.equal(conditionForSegment({}), 'unknown');
  assert.equal(conditionForSegment(null), 'unknown');
  assert.equal(fallbackRouteCondition({geometryVerification:'official-polygons-and-crossings-v1'}), 'sidewalkUnknown');
  assert.equal(fallbackRouteCondition(null), 'unknown');
});

test('shared roads remain distinct while preserving unknown and rough conditions', () => {
  assert.equal(conditionForSegment({sharedRoad:true,unknownWidth:false,unknownSlope:false}), 'shared');
  assert.equal(conditionForSegment({sharedRoad:true}), 'sharedUnknown');
  assert.equal(conditionForSegment({sharedRoad:true,unknownWidth:false,unknownSlope:false,roughSurface:true}), 'sharedRough');
  assert.equal(conditionForSegment({sharedRoad:true,roughSurface:true}), 'sharedRoughUnknown');
  assert.match(stepConditions({sharedRoad:true,unknown:true}), /人車共行.*通行條件未確認.*寬度或坡度未知/);
  assert.doesNotMatch(stepConditions({unknown:true}), /人車共道/);
});

test('recorded sidewalks keep unknown and rough conditions visible', () => {
  assert.equal(conditionForSegment({explicitSidewalk:true,unknownWidth:false,unknownSlope:false}), 'sidewalk');
  assert.equal(conditionForSegment({explicitSidewalk:true}), 'sidewalkUnknown');
  assert.equal(conditionForSegment({explicitSidewalk:true,roughSurface:true}), 'sidewalkRoughUnknown');
  assert.equal(conditionForSegment({explicitSidewalk:true,sharedRoad:true}), 'sharedUnknown');
  assert.equal(conditionForSegment({tier:'official',unknownWidth:false,unknownSlope:false}), 'sidewalk');
  assert.equal(conditionForSegment({tier:'official'}), 'sidewalkUnknown');
  assert.equal(conditionForSegment({tier:'official',explicitSidewalk:true}), 'sidewalkUnknown');
  assert.match(ROUTE_CONDITIONS.sidewalkUnknown.label, /人行道.*未知/);
});

test('rough routes remain identifiable with or without unknown dimensions', () => {
  assert.equal(conditionForSegment({unknownWidth:false,unknownSlope:false,roughSurface:true}), 'rough');
  assert.equal(conditionForSegment({unknownWidth:true,unknownSlope:false,roughSurface:true}), 'roughUnknown');
  const dashes=Object.values(ROUTE_CONDITIONS).map(value=>value.dash || 'solid');
  assert.equal(new Set(dashes).size,dashes.length);
});
