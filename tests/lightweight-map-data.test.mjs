import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
const read = name => JSON.parse(gunzipSync(readFileSync(new URL(`../public/data/${name}.json.gz`, import.meta.url))));

test("lightweight landmarks come from the current facilities and places", () => {
  const facilities = read("facilities"), places = read("places");
  const landmarks = read("landmarks");
  assert.deepEqual(landmarks.filter(p => !p.landmark), facilities.filter(p => String(p.kind) === "20"));
  const byId = new Map(places.map(p => [p.id, p]));
  const notable = landmarks.filter(p => p.landmark);
  assert.ok(notable.length > 0);
  for (const {landmark, ...place} of notable) assert.deepEqual(place, byId.get(place.id));
});
