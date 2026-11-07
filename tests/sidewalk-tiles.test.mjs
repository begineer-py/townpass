import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { tilesForBounds } from "../src/sidewalk-tiles.mjs";

test("only available tiles in view are requested, nearest first", () => {
  const available = new Set(["2504-12151", "2504-12152", "2505-12152", "2506-12152"]);
  assert.deepEqual(tilesForBounds([25.04, 121.51, 25.059, 121.529], {lat:25.045, lng:121.515}, available),
    ["2504-12151", "2504-12152", "2505-12152"]);
});

test("every indexed tile exists and contains valid display geometry", () => {
  const root = new URL("../public/data/sidewalk-tiles/", import.meta.url);
  const manifest = JSON.parse(fs.readFileSync(new URL("index.json", root)));
  assert.ok(manifest.tiles.length > 0);
  for (const key of manifest.tiles) {
    const tile = JSON.parse(gunzipSync(fs.readFileSync(new URL(`${key}.json.gz`, root))));
    assert.ok(tile.scale > 0 && tile.lines.length > 0, key);
    assert.ok(tile.lines.every(row => row.length >= 5 && row.length % 2 === 1 && row.every(Number.isFinite)), key);
  }
});
