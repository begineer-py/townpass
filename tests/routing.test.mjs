import test from "node:test";
import assert from "node:assert/strict";
import {
  createRouter,
  edgeAllowed,
  MinHeap,
  STEP_DIAGNOSTIC,
} from "../src/routing.mjs";

const proof = {
  schemaVersion: 2,
  coverage: 1,
  maxUncoveredMetres: 0,
  crossingCoverage: 0,
  roadCrossingVerified: true,
  crossingVerified: true,
};
const g = {
  officialPathEvidence: { schemaVersion: 2 },
  nodes: [
    [25, 121.5, 0],
    [25, 121.5002, 0],
    [25.0002, 121.5, 0],
    [25.0002, 121.5002, 0],
  ],
  ways: [
    { name: "階梯", highway: "steps", width: 2, slope: 0 },
    { name: "人行道", highway: "footway", width: 1.2, slope: 2 },
  ],
  edges: [
    [0, 1, 20, 0, [], proof],
    [0, 2, 22, 1, [], proof],
    [2, 3, 20, 1, [], proof],
    [3, 1, 22, 1, [], proof],
  ],
};

test("roads explicitly marked without sidewalks are excluded", () => {
  assert.equal(edgeAllowed({ highway: "residential", sidewalk: "no" }), false);
  assert.equal(
    edgeAllowed({ highway: "footway", sidewalk: "no" }, {}, proof),
    true,
  );
});
test("official-only routing requires substantial exact geometric overlap", () => {
  assert.equal(
    edgeAllowed(
      { highway: "footway" },
      { officialOnly: true },
      { ...proof, coverage: 0.4 },
    ),
    false,
  );
  assert.equal(
    edgeAllowed(
      { highway: "footway" },
      { officialOnly: true },
      { ...proof, coverage: 1 },
    ),
    true,
  );
  assert.equal(
    edgeAllowed({ highway: "footway" }, { officialOnly: true }),
    false,
  );
});
test("avoids a shorter staircase instead of trading safety for distance", () => {
  const r = createRouter(g)(g.nodes[0], g.nodes[1]);
  assert.equal(r.distance, 64);
  assert.ok(r.steps.every((s) => s.name !== "階梯"));
});
test("old preference cannot re-enable stairs", () => {
  const r = createRouter(g)(g.nodes[0], g.nodes[1], { avoidSteps: false });
  assert.equal(r.distance, 64);
});
test("internal diagnostic can identify the staircase without exposing it by preference", () => {
  const r = createRouter(g)(g.nodes[0], g.nodes[1], {
    avoidSteps: false,
    stepDiagnostic: STEP_DIAGNOSTIC,
  });
  assert.equal(r.distance, 20);
  assert.equal(r.steps[0].highway, "steps");
});
test("known dimensions enforce width and uphill/downhill limits", () => {
  assert.equal(
    edgeAllowed(
      { highway: "footway", width: 0.6, slope: 0 },
      { minWidth: 0.9 },
    ),
    false,
  );
  assert.equal(
    edgeAllowed({ highway: "footway", width: 1, slope: -12 }, { maxSlope: 8 }),
    false,
  );
});
test("unknown data is never converted to verified clear passage", () => {
  const w = { highway: "footway", width: null, slope: null };
  assert.equal(edgeAllowed(w, { knownOnly: true }, proof), false);
  assert.equal(edgeAllowed(w, { knownOnly: false }, proof), true);
  const r = createRouter({
    ...g,
    ways: g.ways.map((w) => ({ ...w, width: null, slope: null })),
  })(g.nodes[0], g.nodes[1]);
  assert.equal(r.unknownPct, 100);
});
test("nearby disconnected ways are never joined with invented straight lines", () => {
  const graph = {
    ...g,
    edges: [
      [0, 2, 22, 1, [], proof],
      [1, 3, 22, 1, [], proof],
    ],
  };
  assert.equal(createRouter(graph)(g.nodes[0], g.nodes[1]).error, "NO_ROUTE");
});
test("marked barriers prevent passing through a node", () => {
  const graph = {
    ...g,
    nodes: g.nodes.map((n, i) => (i === 2 ? [...n.slice(0, 2), 1] : n)),
  };
  assert.equal(createRouter(graph)(g.nodes[0], g.nodes[1]).error, "NO_ROUTE");
});
test("distant endpoints are rejected instead of snapped across a city block", () => {
  assert.equal(
    createRouter(g)([25.1, 121.5], g.nodes[1]).error,
    "NO_CONNECTION",
  );
});
test("compressed geometry is expanded in either direction", () => {
  const graph = {
    officialPathEvidence: { schemaVersion: 2 },
    nodes: [g.nodes[0], g.nodes[1]],
    ways: [g.ways[1]],
    edges: [[0, 1, 25, 0, [[25.00005, 121.5001]], proof]],
  };
  const r = createRouter(graph)(g.nodes[1], g.nodes[0]);
  assert.deepEqual(r.coordinates, [
    g.nodes[1].slice(0, 2),
    [25.00005, 121.5001],
    g.nodes[0].slice(0, 2),
  ]);
});
test("heap returns minimum cost including duplicate priorities", () => {
  const h = new MinHeap();
  [3, 1, 8, 2, 1].forEach((n) => h.push([n]));
  assert.deepEqual(
    Array.from({ length: 5 }, () => h.pop()[0]),
    [1, 1, 2, 3, 8],
  );
});

test("a nearby elevator maintenance point makes the router take the longer sidewalk", () => {
  const proof = {
    schemaVersion: 2,
    coverage: 1,
    maxUncoveredMetres: 0,
    crossingCoverage: 0,
    roadCrossingVerified: true,
    crossingVerified: true,
  };
  const nodes = [
    [25, 121.5, 0],
    [25.00015, 121.5, 0],
    [25.0004, 121.5, 0],
    [25, 121.5004, 0],
    [25.0004, 121.5004, 0],
  ];
  const graph = {
    officialPathEvidence: { schemaVersion: 2 },
    roadGeometries: [],
    officialCrossingAreas: [],
    nodes,
    ways: [
      { name: "近", highway: "footway", width: 2, slope: 0 },
      { name: "遠", highway: "footway", width: 2, slope: 0 },
    ],
    edges: [
      [0, 1, 17, 0, [], proof],
      [1, 2, 28, 0, [], proof],
      [0, 3, 40, 1, [], proof],
      [3, 4, 45, 1, [], proof],
      [4, 2, 40, 1, [], proof],
    ],
  };
  const route = createRouter(graph);
  assert.equal(route(nodes[0], nodes[2]).distance, 45);
  assert.equal(
    route(nodes[0], nodes[2], { avoidPoints: [nodes[1]] }).distance,
    125,
  );
});
test("tier weighting can choose a much shorter OSM path without claiming known slope", () => {
  const graph = {
    ...g,
    officialPathEvidence: { schemaVersion: 2, integratedAt: "2026-11-07" },
    ways: g.ways.map((w) => ({ ...w, highway: "footway", slope: null })),
    edges: g.edges.map((e, i) => [
      ...e.slice(0, 5),
      { ...proof, coverage: i === 0 ? 0 : 1 },
    ]),
  };
  const result = createRouter(graph)(g.nodes[0], g.nodes[1]);
  assert.equal(result.distance, 20);
  assert.equal(result.officialCoveragePct, 0);
  assert.equal(createRouter(graph)(g.nodes[0],g.nodes[1],{officialOnly:true}).distance,64);
  assert.equal(result.unknownPct, 100);
});

test("a nearby elevator maintenance point makes the router take the longer sidewalk", () => {
  const proof = {
    schemaVersion: 2,
    coverage: 1,
    maxUncoveredMetres: 0,
    crossingCoverage: 0,
    roadCrossingVerified: true,
    crossingVerified: true,
  };
  const nodes = [
    [25, 121.5, 0],
    [25.00015, 121.5, 0],
    [25.0004, 121.5, 0],
    [25, 121.5004, 0],
    [25.0004, 121.5004, 0],
  ];
  const graph = {
    officialPathEvidence: { schemaVersion: 2 },
    roadGeometries: [],
    officialCrossingAreas: [],
    nodes,
    ways: [
      { name: "近", highway: "footway", width: 2, slope: 0 },
      { name: "遠", highway: "footway", width: 2, slope: 0 },
    ],
    edges: [
      [0, 1, 17, 0, [], proof],
      [1, 2, 28, 0, [], proof],
      [0, 3, 40, 1, [], proof],
      [3, 4, 45, 1, [], proof],
      [4, 2, 40, 1, [], proof],
    ],
  };
  const route = createRouter(graph);
  assert.equal(route(nodes[0], nodes[2]).distance, 45);
  assert.equal(
    route(nodes[0], nodes[2], { avoidPoints: [nodes[1]] }).distance,
    125,
  );
});
