import fs from "node:fs";
import { requestOfficialRoute, OFFICIAL_ROUTE_URL } from "../src/official-router.mjs";
const previous = JSON.parse(
  fs.readFileSync("reports/official-router-benchmark.json", "utf8"),
);
const results = [];
for (const pair of previous) {
  const start = performance.now();
  try {
    const route = await requestOfficialRoute(
      pair.start,
      pair.end,
      {},
      AbortSignal.timeout(25000),
      OFFICIAL_ROUTE_URL,
    );
    results.push({
      ...pair,
      checkedAt: new Date().toISOString(),
      responseReceived: true,
      accepted: !route.error,
      rejection: route.error,
      entranceConfirmation: route.requiresEntryConfirmation,
      startGap: route.startGap,
      endGap: route.endGap,
      elapsedMs: Math.round(performance.now() - start),
    });
  } catch (e) {
    results.push({ ...pair, checkedAt: new Date().toISOString(), responseReceived: false, accepted: false, error: e.message });
  }
}
fs.writeFileSync(
  "reports/official-router-benchmark.json",
  JSON.stringify(results, null, 2),
);
console.log(
  JSON.stringify({
    queries: results.length,
    returned: results.filter((r) => r.responseReceived).length,
    accepted: results.filter((r) => r.accepted).length,
    needsEntranceConfirmation: results.filter(
      (r) => r.accepted && r.entranceConfirmation,
    ).length,
    rejected: results.filter((r) => !r.accepted),
  }),
);
