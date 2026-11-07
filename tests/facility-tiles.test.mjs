import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { facilityTileKeys } from '../src/facility-tiles.mjs';

test('visible tile keys are bounded and ordered from the map centre', () => {
  const keys = facilityTileKeys([25.004, 121.504, 25.026, 121.526], 25.015, 121.515);
  assert.equal(keys.length, 9);
  assert.equal(keys[0], '2501_12151');
  assert.deepEqual(facilityTileKeys([30, 130, 31, 131], 30, 130), []);
  assert.deepEqual(facilityTileKeys([NaN, 121, 25, 122], 25, 121), []);
});

test('map tile index represents the current eligible facilities', () => {
  const read = (name) => JSON.parse(gunzipSync(readFileSync(new URL(`../public/data/${name}.json.gz`, import.meta.url))));
  const allowed = new Set(['metro-elevator', '1', '3', '4', '7', '8', '9', 'park', 'place', '14', '15', '16', '18', 'toilet', 'public-toilet', 'rest', 'water', 'health', 'elevator', 'friendly', 'parking', 'facility']);
  const expected = [...read('facilities'), ...read('places')].filter(p => allowed.has(String(p.kind)) && Number.isFinite(p.lat) && Number.isFinite(p.lon));
  const keys = JSON.parse(readFileSync(new URL('../public/data/facility-tiles/index.json', import.meta.url)));
  const actual = keys.flatMap(key => JSON.parse(gunzipSync(readFileSync(new URL(`../public/data/facility-tiles/${key}.json.gz`, import.meta.url)))));
  assert.deepEqual(actual.map(p => p.id).sort(), expected.map(p => p.id).sort());
  assert.ok(actual.some(p => String(p.kind) === '18'), 'bus stops are included');
});
