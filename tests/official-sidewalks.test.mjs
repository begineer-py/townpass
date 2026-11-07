import test from "node:test";
import assert from "node:assert/strict";
import {
  parseOfficialSidewalks,
  parseSidewalkWkt,
} from "../src/official-sidewalks.mjs";

test("official sidewalk WKT keeps valid TWD97 line parts and bounds", () => {
  const lines = parseSidewalkWkt(
    "MULTILINESTRING ((306702.049 2771290.0677, 306704.9381 2771290.3954), (306710 2771300, 306712 2771302))",
    "139533",
  );
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0], {
    id: "139533",
    coordinates: [
      [306702.049, 2771290.0677],
      [306704.9381, 2771290.3954],
    ],
    bounds: [306702.049, 2771290.0677, 306704.9381, 2771290.3954],
  });
});

test("official sidewalk payload fails closed on malformed data", () => {
  assert.throws(
    () => parseOfficialSidewalks({ code: "500", data: [] }),
    /INVALID_OFFICIAL_SIDEWALKS/,
  );
  assert.deepEqual(parseSidewalkWkt("LINESTRING (306702 2771290, 306704 2771291)"), []);
});

test("bundled sidewalk file decodes to lat/lon lines and filters by view", async () => {
  const { decodeSidewalks, visibleSidewalkLines } = await import("../src/official-sidewalks.mjs");
  const features = decodeSidewalks({
    scale: 1e6,
    lines: [[25040000, 121510000, 25041000, 121512000, 25040000, 121510000, 25041000, 121512000]],
  });
  assert.deepEqual(features[0].latLngs, [[25.04, 121.51], [25.041, 121.512]]);
  const view = (s, w, n, e) => ({ getSouth: () => s, getWest: () => w, getNorth: () => n, getEast: () => e });
  assert.equal(visibleSidewalkLines(features, view(25.03, 121.5, 25.05, 121.52)).length, 1);
  assert.equal(visibleSidewalkLines(features, view(25.1, 121.6, 25.2, 121.7)).length, 0);
  assert.throws(() => decodeSidewalks({}), /INVALID_SIDEWALKS/);
});

test("the bundled sidewalk file exists and is not empty", async () => {
  const { statSync } = await import("node:fs");
  assert.ok(statSync(new URL("../public/data/sidewalks.json.gz", import.meta.url)).size > 100_000);
});
