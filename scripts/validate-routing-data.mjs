import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { validateNetwork } from "../src/network-contract.mjs";
import { edgeAllowed } from "../src/routing.mjs";
import { officialGeometryEvidence } from '../src/supplemental-evidence.mjs';
const graph = JSON.parse(
  gunzipSync(
    fs.readFileSync(new URL("../public/data/graph.json.gz", import.meta.url)),
  ),
);
validateNetwork(graph);
officialGeometryEvidence(graph);
const usable = graph.edges.filter((e) =>
  edgeAllowed(graph.ways[e[3]], {}, e[5]),
);
console.log(
  JSON.stringify({
    schema: 2,
    edges: graph.edges.length,
    eligiblePedestrianEdges: usable.length,
    sharedRoadEdges: usable.filter((e) => graph.ways[e[3]].source === "osm-shared-street").length,
    otherVehicleEdgesAllowed: usable.filter(
      (e) =>
        graph.ways[e[3]].source !== "osm-shared-street" && !["footway", "path", "pedestrian", "corridor"].includes(
          graph.ways[e[3]].highway,
        ),
    ).length,
  }),
);
