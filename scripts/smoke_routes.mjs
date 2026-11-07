import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import { createRouter } from "../src/routing.mjs";
const graph = JSON.parse(
  gunzipSync(
    fs.readFileSync(new URL("../public/data/graph.json.gz", import.meta.url)),
  ),
);
const route = createRouter(graph);
const pairs = [
  ["大安森林公園", [25.0332, 121.5355], [25.0301, 121.5356]],
  ["北投", [25.1321, 121.4986], [25.1367, 121.5036]],
  ["士林", [25.0933, 121.5262], [25.0878, 121.5255]],
  ["內湖", [25.0834, 121.5655], [25.0827, 121.5714]],
  ["南港", [25.0516, 121.6071], [25.0555, 121.6111]],
  ["信義", [25.0331, 121.5637], [25.0363, 121.5656]],
  ["中正", [25.0357, 121.5166], [25.0401, 121.513]],
  ["萬華", [25.0353, 121.4995], [25.0372, 121.4999]],
  ["文山", [24.9982, 121.5797], [24.9999, 121.5749]],
];
for (const [name, a, b] of pairs) {
  const before = performance.now(),
    r = route(a, b);
  console.log(
    JSON.stringify({
      name,
      error: r.error,
      metres: r.distance,
      steps: r.steps?.length,
      ms: Math.round(performance.now() - before),
      unknown: r.unknownPct,
      officialOverlap: r.officialCoveragePct,
    }),
  );
}
