import test from "node:test";
import assert from "node:assert/strict";
import { createRouter, edgeAllowed } from "../src/routing.mjs";

// Coordinates use the same local metre approximation as the routing engine.
const node = (east, north, blocked = 0) => [
  25 + north / 111195,
  121.5 + east / 100700,
  blocked,
];
const evidence = (overrides = {}) => ({
  schemaVersion: 2,
  coverage: 1,
  maxUncoveredMetres: 0,
  roadCrossingVerified: true,
  crossingCoverage: 0,
  crossingVerified: true,
  featureIds: [0],
  ...overrides,
});
const footway = {
  name: "有依據的人行道",
  highway: "footway",
  width: 1.2,
  slope: 2,
  wheelchair: "yes",
};
const edge = (a, b, metres, way, proof = evidence(), geometry = []) => [
  a,
  b,
  metres,
  way,
  geometry,
  proof,
];
const graph = (nodes, ways, edges) => ({
  nodes,
  ways,
  edges,
  officialPathEvidence: {
    schemaVersion: 2,
    integratedAt: "2026-11-07T00:00:00Z",
  },
});

test("endpoint projection checks safety before limiting nearby candidates", () => {
  const nodes = [], edges = [];
  for (let north = 1; north <= 13; north++) {
    const first = nodes.length;
    nodes.push(node(-100, north), node(100, north));
    edges.push(edge(first, first + 1, 200, 0));
  }
  const g = { ...graph(nodes, [footway], edges), roadGeometries: [], officialCrossingAreas: [] };
  const route = createRouter(g)(node(0, 0), node(30, 13), {
    approachAllowed: (_point, candidate) => Math.abs(candidate[0] - node(0, 13)[0]) < 0.00000001,
    lineAllowed: () => true,
  });
  assert.equal(route.error, undefined);
});

test("separately mapped walking paths can pass complete evidence checks", () => {
  for (const highway of ["footway", "path", "pedestrian", "corridor"]) {
    assert.equal(
      edgeAllowed({ ...footway, highway }, {}, evidence()),
      true,
      highway,
    );
  }
});

test("sidewalk=yes on a vehicle way never authorizes walking its centerline", () => {
  const permissiveOptions = {
    officialOnly: false,
    preferOfficial: false,
    avoidSteps: false,
    knownOnly: false,
  };
  for (const highway of [
    "motorway",
    "motorway_link",
    "trunk",
    "trunk_link",
    "primary",
    "primary_link",
    "secondary",
    "secondary_link",
    "tertiary",
    "tertiary_link",
    "residential",
    "unclassified",
    "service",
    "living_street",
    "track",
    "cycleway",
    "steps",
  ]) {
    assert.equal(
      edgeAllowed(
        { ...footway, highway, sidewalk: "yes" },
        permissiveOptions,
        evidence(),
      ),
      false,
      highway,
    );
  }
});

test("legacy or incomplete evidence cannot be enabled by saved preferences", () => {
  const options = { officialOnly: false, preferOfficial: false };
  for (const proof of [
    null,
    { coverage: 1 },
    evidence({ schemaVersion: 1 }),
    evidence({ roadCrossingVerified: false }),
    evidence({ roadCrossingVerified: undefined }),
  ]) {
    assert.equal(edgeAllowed(footway, options, proof), false);
  }
});
test("partial official overlap can connect walking paths, and official-only mode still rejects it", () => {
  const partial = evidence({ coverage: 0.2, maxUncoveredMetres: 12 });
  assert.equal(edgeAllowed(footway, { officialOnly: false }, partial), true);
  assert.equal(edgeAllowed(footway, { officialOnly: true }, partial), false);
  assert.equal(edgeAllowed(footway, {}, evidence({ coverage: 0 })), true);
});

test("missing or non-finite measurements and truthy verification values fail closed", () => {
  for (const proof of [
    evidence({ coverage: undefined }),
    evidence({ coverage: Number.NaN }),
    evidence({ coverage: Number.POSITIVE_INFINITY }),
    evidence({ maxUncoveredMetres: Number.NaN }),
    evidence({ roadCrossingVerified: "true" }),
    evidence({ roadCrossingVerified: 1 }),
    evidence({ roadCrossingVerified: {} }),
  ]) {
    assert.equal(edgeAllowed(footway, {}, proof), false);
  }
});

test("an OSM crossing flag needs verified official crossing evidence", () => {
  const crossing = { ...footway, crossing: true };
  assert.equal(
    edgeAllowed(crossing, {}, evidence({ crossingVerified: false })),
    false,
  );
  assert.equal(
    edgeAllowed(crossing, {}, evidence({ crossingVerified: undefined })),
    false,
  );
  assert.equal(edgeAllowed(crossing, {}, evidence()), true);
});

test("official crossing overlap cannot evade checks through a missing OSM tag", () => {
  assert.equal(
    edgeAllowed(
      { ...footway, crossing: false },
      {},
      evidence({ crossingCoverage: 0.2, crossingVerified: false }),
    ),
    false,
  );
});

test("an unverified road intersection blocks an otherwise fully covered footway", () => {
  assert.equal(
    edgeAllowed(
      footway,
      { officialOnly: false },
      evidence({ roadCrossingVerified: false }),
    ),
    false,
  );
});

test("a short road shortcut is rejected even when the walking detour is longer", () => {
  const g = graph(
    [node(0, 0), node(20, 0), node(0, 20), node(20, 20)],
    [
      { ...footway, name: "車道捷徑", highway: "primary", sidewalk: "yes" },
      footway,
    ],
    [
      edge(0, 1, 20, 0),
      edge(0, 2, 20, 1),
      edge(2, 3, 20, 1),
      edge(3, 1, 20, 1),
    ],
  );
  const result = createRouter(g)(g.nodes[0], g.nodes[1], {
    officialOnly: false,
    avoidSteps: false,
    preferOfficial: false,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.distance, 60);
  assert.equal(result.roadPct, 0);
  assert.ok(result.steps.every((step) => step.highway === "footway"));
  assert.deepEqual(
    result.coordinates,
    [0, 2, 3, 1].map((i) => g.nodes[i].slice(0, 2)),
  );
});

test("disconnected sidewalks do not borrow the vehicle road between them", () => {
  const g = graph(
    [node(0, 0), node(10, 0), node(30, 0), node(40, 0)],
    [footway, { ...footway, highway: "residential", sidewalk: "both" }],
    [edge(0, 1, 10, 0), edge(1, 2, 20, 1), edge(2, 3, 10, 0)],
  );
  assert.equal(createRouter(g)(g.nodes[0], g.nodes[3]).error, "NO_ROUTE");
});

test("an unverified crossing cannot bridge two valid sidewalk components", () => {
  const g = graph(
    [node(0, 0), node(10, 0), node(30, 0), node(40, 0)],
    [footway, { ...footway, crossing: true }],
    [
      edge(0, 1, 10, 0),
      edge(1, 2, 20, 1, evidence({ crossingVerified: false })),
      edge(2, 3, 10, 0),
    ],
  );
  assert.equal(createRouter(g)(g.nodes[0], g.nodes[3]).error, "NO_ROUTE");
});

test("nearest unavailable road node is not skipped to snap onto the other side", () => {
  const g = graph(
    [node(0, 0), node(-10, 0), node(4, 0), node(24, 0)],
    [{ ...footway, highway: "primary" }, footway],
    [edge(0, 1, 10, 0), edge(2, 3, 20, 1)],
  );
  assert.equal(createRouter(g)(g.nodes[0], g.nodes[3]).error, "NO_CONNECTION");
});

test("a blocked nearest node is not silently skipped during endpoint snapping", () => {
  const g = graph(
    [node(0, 0, 1), node(-10, 0), node(3, 0), node(23, 0)],
    [footway],
    [edge(0, 1, 10, 0), edge(2, 3, 20, 0)],
  );
  assert.equal(createRouter(g)(g.nodes[0], g.nodes[3]).error, "NO_CONNECTION");
});

test("a gap without a vehicle-way mask is rejected", () => {
  const g = graph([node(0, 0), node(20, 0)], [footway], [edge(0, 1, 20, 0)]);
  assert.equal(createRouter(g)(node(-6, 0), g.nodes[1]).error, "NO_CONNECTION");
});

test("an approach that does not cross a vehicle way can reach the walking network", () => {
  const g = graph([node(0, 0), node(40, 0)], [footway], [edge(0, 1, 40, 0)]);
  g.roadGeometries = [];
  g.officialCrossingAreas = [];
  const result = createRouter(g)(node(0, 12), node(40, 4));
  assert.equal(result.error, undefined);
  assert.equal(result.distance, 40);
});

test("searching farther for a sidewalk still refuses to cross a vehicle way", () => {
  const g = graph([node(0, 0), node(20, 0)], [footway], [edge(0, 1, 20, 0)]);
  const roadLon = 121.5 - 4 / 100700;
  g.roadGeometries = [
    [
      [roadLon, 24.9],
      [roadLon, 25.1],
    ],
  ];
  g.officialCrossingAreas = [];
  assert.equal(
    createRouter(g)(node(-8, 0), g.nodes[1]).error,
    "NO_CONNECTION",
  );
});

test("a gap past the snap limit is rejected", () => {
  const g = graph([node(0, 0), node(20, 0)], [footway], [edge(0, 1, 20, 0)]);
  g.roadGeometries = [];
  g.officialCrossingAreas = [];
  assert.equal(
    createRouter(g)(node(-100, 0), g.nodes[1]).error,
    "NO_CONNECTION",
  );
});
