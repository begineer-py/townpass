import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { maintenanceText, stationKey } from "../src/format.mjs";
import { validateNetwork } from "../src/network-contract.mjs";
const load = (name) =>
  JSON.parse(
    gunzipSync(
      fs.readFileSync(
        new URL(`../public/data/${name}.json.gz`, import.meta.url),
      ),
    ),
  );
test("legacy graph schema is rejected before routing", () =>
  assert.throws(
    () => validateNetwork({ officialPathEvidence: { schemaVersion: 1 } }),
    /UNVERIFIED_NETWORK/,
  ));
test("missing independent road crossing masks are rejected", () =>
  assert.throws(
    () =>
      validateNetwork({
        officialPathEvidence: { schemaVersion: 2 },
        officialAreas: [{}],
      }),
    /MISSING_CROSSING_MASK/,
  ));
test("official facilities have finite region coordinates and source provenance", () => {
  const rows = load("facilities");
  assert.ok(rows.length > 30000);
  for (const p of rows) {
    assert.ok(
      p.lat > 24.94 && p.lat < 25.24 && p.lon > 121.42 && p.lon < 121.69,
    );
    assert.ok(p.sourceId);
    assert.ok(p.name);
    assert.notEqual(p.widthCm, -1);
  }
  assert.ok(rows.filter((p) => p.kind === "toilet").length > 500);
  assert.ok(rows.filter((p) => p.kind === "metro-elevator").length > 150);
});
test("station identity accounts for Taipei Main Station suffix", () => {
  assert.equal(stationKey("台北車站"), stationKey("台北車"));
});
test("maintenance codes are translated into readable dates and periods", () => {
  assert.equal(
    maintenanceText({
      民國年月日: "1151113",
      電梯位置: "P(月台)",
      保養時段: "N(夜保)",
    }),
    "2026 年 11 月 13 日 · 月台電梯 · 夜間保養",
  );
});
test("construction payload excludes workers phone and contact data", () => {
  for (const p of load("construction")) {
    assert.ok(!("Tc_Tl3" in p));
    assert.ok(!("Tc_Tl" in p));
  }
});
