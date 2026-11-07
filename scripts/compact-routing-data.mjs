import fs from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { edgeAllowed } from "../src/routing.mjs";
import { validateNetwork } from "../src/network-contract.mjs";
const path = new URL("../public/data/graph.json.gz", import.meta.url),
  bytes = fs.readFileSync(path),
  g = JSON.parse(gunzipSync(bytes));
validateNetwork(g);
if (!g.graphTrimmed) {
  fs.mkdirSync(new URL("../data/processed/", import.meta.url), {
    recursive: true,
  });
  fs.writeFileSync(
    new URL("../data/processed/graph-evidence-full.json.gz", import.meta.url),
    bytes,
  );
}
const before = g.edges.length;
g.edges = g.edges.filter(
  (e) =>
    !g.nodes[e[0]][2] &&
    !g.nodes[e[1]][2] &&
    edgeAllowed(g.ways[e[3]], { minWidth: 0, maxSlope: Infinity }, e[5]),
);
// Retain every original node for honest nearest-node checks; don't snap past a removed road node.
const wayIds = [...new Set(g.edges.map((e) => e[3]))],
  indices = new Map(wayIds.map((id, i) => [id, i]));
g.ways = wayIds.map((id) => g.ways[id]);
g.edges.forEach((e) => (e[3] = indices.get(e[3])));
g.graphTrimmed = true;
g.sourceEdgeCount = g.sourceEdgeCount || before;
fs.writeFileSync(path, gzipSync(JSON.stringify(g), { level: 9 }));
console.log(
  JSON.stringify({
    exportedPedestrianEdges: g.edges.length,
    rawNodesRetained: g.nodes.length,
    beforeBytes: bytes.length,
    afterBytes: fs.statSync(path).size,
  }),
);
