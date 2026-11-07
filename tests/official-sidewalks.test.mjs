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
