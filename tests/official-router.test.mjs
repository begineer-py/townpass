import test from "node:test";
import assert from "node:assert/strict";
import { normalizeOfficialRoute } from "../src/official-router.mjs";
const a = [25.047, 121.517],
  b = [25.048, 121.517];
const base = () => ({
  success: true,
  metadata: {
    crs: "EPSG:3826",
    total_distance: 111,
    used_alt: false,
    issues_count: { unfavorable: 0, unaligned: 0 },
    gap_records: [],
  },
  geometry_wgs84: {
    type: "LineString",
    coordinates: [
      [a[1], a[0]],
      [b[1], b[0]],
    ],
  },
  segments: [
    {
      source: "main",
      length: 111,
      road_name: "人行道",
      geometry: {
        coordinates: [
          [302100, 2771000],
          [302100, 2771111],
        ],
      },
    },
  ],
});
test("official primary network route can be returned without claiming measured slope", () => {
  const r = normalizeOfficialRoute(base(), a, b);
  assert.equal(r.provider, "taipei-official");
  assert.equal(r.requiresEntryConfirmation, false);
  assert.equal(r.unknownPct, 100);
  assert.equal(r.roadPct, null);
});
test("official alternative or adverse route is not offered as accessible", () => {
  for (const patch of [
    { used_alt: true },
    { issues_count: { unfavorable: 1, unaligned: 0 } },
    { issues_count: {} },
  ]) {
    const d = base();
    Object.assign(d.metadata, patch);
    assert.equal(normalizeOfficialRoute(d, a, b).error, "OFFICIAL_BLOCKED");
  }
});
test("centroid far from the actual entrance requires confirmation and no connector is invented", () => {
  const r = normalizeOfficialRoute(base(), [25.045, 121.515], b);
  assert.equal(r.requiresEntryConfirmation, true);
  assert.equal(r.coordinates.length, 2);
  assert.deepEqual(r.coordinates[0], a);
});
test("large or inserted issue gaps fail closed", () => {
  for (const g of [
    { gap_m: 3, snapped: true, inserted_issue_gap: false },
    { gap_m: 0.01, snapped: true, inserted_issue_gap: true },
    {},
  ]) {
    const d = base();
    d.metadata.gap_records = [g];
    assert.equal(normalizeOfficialRoute(d, a, b).error, "OFFICIAL_GAP");
  }
});
test("sub-decimetre explicit snapped alignment is accepted", () => {
  const d = base();
  d.metadata.gap_records = [
    { gap_m: 0.076, snapped: true, inserted_issue_gap: false },
  ];
  assert.equal(normalizeOfficialRoute(d, a, b).error, undefined);
});
test("known-dimensions preference is not silently ignored by official provider", () =>
  assert.equal(
    normalizeOfficialRoute(base(), a, b, { knownOnly: true }).error,
    "OFFICIAL_DIMENSIONS",
  ));
test("missing coordinates or unknown segment source fails closed", () => {
  const d = base();
  d.segments[0].source = "unknown";
  assert.equal(normalizeOfficialRoute(d, a, b).error, "OFFICIAL_INVALID");
  delete d.geometry_wgs84;
  assert.equal(normalizeOfficialRoute(d, a, b).error, "OFFICIAL_INVALID");
});
test("sub-metre clipped endpoint does not generate a zero-distance turn instruction", () => {
  const d = base();
  d.segments.unshift({ ...d.segments[0], length: 0.01, geometry: { coordinates: [[302100,2771000.01],[302100,2771000]] } });
  const r = normalizeOfficialRoute(d, a, b);
  assert.equal(r.steps.length, 1);
  assert.equal(r.steps[0].turn, "直行");
  assert.equal(r.coordinates.length, 2);
});

test('candidate is not granted usable policy before independent geometry verification',()=>{
 assert.equal(normalizeOfficialRoute(base(),a,b).policyVersion,null);
});
test('tiny staircase segment is rejected before instruction filtering',()=>{
 const d=base();d.segments[0].length=0.01;d.segments[0].road_type='樓梯';
 assert.equal(normalizeOfficialRoute(d,a,b).error,'OFFICIAL_BLOCKED');
});

test('an explicit missing-crosswalk label is never parsed as a marked crossing',()=>{
  const d=base();d.segments[0].road_type='尚無行穿線';
  assert.equal(normalizeOfficialRoute(d,a,b).error,'OFFICIAL_CROSSING_UNVERIFIED');
});
