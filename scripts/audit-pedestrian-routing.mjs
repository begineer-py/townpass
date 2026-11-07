import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import assert from "node:assert/strict";
import { createRouter, edgeAllowed, ROUTING_POLICY } from "../src/routing.mjs";
import { validateNetwork } from "../src/network-contract.mjs";
const g = JSON.parse(
  gunzipSync(
    fs.readFileSync(new URL("../public/data/graph.json.gz", import.meta.url)),
  ),
);
validateNetwork(g);
const adj = new Map();
let accepted = 0;
for (const e of g.edges) {
  if (
    !edgeAllowed(g.ways[e[3]], {}, e[5]) ||
    g.nodes[e[0]][2] ||
    g.nodes[e[1]][2]
  )
    continue;
  accepted++;
  for (const [a, b] of [
    [e[0], e[1]],
    [e[1], e[0]],
  ]) {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a).push(b);
  }
}
const seen = new Set(),
  components = [];
for (const n of adj.keys()) {
  if (seen.has(n)) continue;
  const q = [n];
  seen.add(n);
  for (let i = 0; i < q.length; i++)
    for (const v of adj.get(q[i]) || [])
      if (!seen.has(v)) {
        seen.add(v);
        q.push(v);
      }
  components.push(q);
}
components.sort((a, b) => b.length - a.length);
const r = createRouter(g);
const successful = [];
for (const c of components.slice(0, 15)) {
  const a = c[0],
    b = c.at(-1);
  const result = r(g.nodes[a], g.nodes[b]);
  if (!result.error) {
    assert.equal(result.roadPct, 0);
    assert.equal(result.policyVersion, ROUTING_POLICY);
    successful.push({
      start: g.nodes[a].slice(0, 2),
      end: g.nodes[b].slice(0, 2),
      distance: result.distance,
      roadPct: result.roadPct,
      officialCoveragePct: result.officialCoveragePct,
    });
  }
}
assert.ok(
  successful.length > 0,
  "Known evidenced walking components should remain routable",
);
const report = {
  policy: ROUTING_POLICY,
  eligibleEdges: accepted,
  components: components.length,
  largestComponentNodes: components[0]?.length,
  successful,
};
fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync(
  "reports/pedestrian-routing-audit.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
