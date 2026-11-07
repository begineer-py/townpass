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
  ["士林", [25.0952823, 121.526314], [25.0872214, 121.5268329]],
  ["內湖", [25.0845566, 121.5613359], [25.0778985, 121.5663986]],
  ["南港", [25.0542693, 121.6023029], [25.0578622, 121.610305]],
  ["信義", [25.0331, 121.5637], [25.0363, 121.5656]],
  ["中正", [25.0351399, 121.5164399], [25.0401123, 121.5130267]],
  ["萬華", [25.0352306, 121.4995709], [25.0370086, 121.5002032]],
  ["文山", [24.9946994, 121.5719269], [25.0025274, 121.571857]],
];
let failed = 0;
for (const [name, a, b] of pairs) {
  const before = performance.now(),
    r = route(a, b);
  if (r.error) failed++;
  console.log(
    JSON.stringify({
      name,
      error: r.error,
      metres: r.distance,
      steps: r.steps?.length,
      ms: Math.round(performance.now() - before),
      unknown: r.unknownPct,
      officialOverlap: r.officialCoveragePct,
      roadPct: r.roadPct,
    }),
  );
}
if (failed) process.exitCode = 1;
