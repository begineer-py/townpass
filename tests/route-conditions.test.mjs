import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUTE_CONDITIONS, conditionForSegment } from '../src/route-conditions.mjs';

test('route display keeps unknown data distinct from known dimensions', () => {
  assert.equal(conditionForSegment({unknownWidth:false,unknownSlope:false,roughSurface:false}), 'known');
  assert.equal(conditionForSegment({unknownWidth:true,unknownSlope:false,roughSurface:false}), 'unknown');
  assert.equal(conditionForSegment({unknownWidth:false,unknownSlope:true,roughSurface:false}), 'unknown');
  assert.equal(conditionForSegment({}), 'unknown');
  assert.equal(conditionForSegment(null), 'unknown');
});

test('rough routes remain identifiable with or without unknown dimensions', () => {
  assert.equal(conditionForSegment({unknownWidth:false,unknownSlope:false,roughSurface:true}), 'rough');
  assert.equal(conditionForSegment({unknownWidth:true,unknownSlope:false,roughSurface:true}), 'roughUnknown');
  const dashes=Object.values(ROUTE_CONDITIONS).map(value=>value.dash || 'solid');
  assert.equal(new Set(dashes).size,dashes.length);
});
