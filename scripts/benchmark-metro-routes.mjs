import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createRouter, metres } from '../src/routing.mjs';
import { createLocalRouteVerifier, planPlaces } from '../src/local-route-verifier.mjs';
import { createConstructionChecker } from '../src/construction.mjs';

// Fixed seed and public station addresses make the sample reproducible. This is
// a metro-station sample, not a measure of every address or real-world safety.
const seed = 20261107;
let randomState = seed;
const random = () => ((randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0) / 2 ** 32);
const shuffle = values => {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};
const load = name => JSON.parse(gunzipSync(fs.readFileSync(`public/data/${name}.json.gz`)));
const graph = load('graph'), facilities = load('facilities');
const stations = facilities.filter(p => String(p.kind) === '20' && /臺北市|台北市/.test(p.address || ''))
  .sort((a, b) => a.id.localeCompare(b.id, 'en'));
const response = await fetch('http://localhost:4173/api/construction');
if (!response.ok) throw new Error(`Construction data unavailable: ${response.status}`);
const snapshot = await response.json();
const router = createRouter(graph), verifyLocal = createLocalRouteVerifier(graph, facilities);
const checker = createConstructionChecker(snapshot);
const pairs = [];
for (const start of shuffle(stations)) {
  const candidates = stations.filter(end => end.id !== start.id &&
    metres([start.lat, start.lon], [end.lat, end.lon]) >= 500 &&
    metres([start.lat, start.lon], [end.lat, end.lon]) <= 3000);
  if (!candidates.length) continue;
  const end = candidates[Math.floor(random() * candidates.length)];
  pairs.push({ start, end });
  if (pairs.length === 40) break;
}
const results = [];
for (const { start, end } of pairs) {
  const result = planPlaces(start, end, { officialOnly: false }, snapshot,
    { router, verifyLocal, facilities, checker });
  results.push({ start: start.name, end: end.name, startId: start.id, endId: end.id,
    straightMetres: Math.round(metres([start.lat, start.lon], [end.lat, end.lon])),
    success: !result.error, error: result.error || null,
    distance: result.distance ?? null });
  console.log(`${results.length}/${pairs.length} ${start.name} → ${end.name}: ${result.error || 'OK'}`);
}
const report = { checkedAt: new Date().toISOString(), constructionUpdatedAt: snapshot.sourceUpdatedAt,
  method: 'Seeded sample of Taipei-address metro stations, one destination 500–3000 m away per origin; public route data only. Not a citywide or physical accessibility success rate.',
  seed, stationsAvailable: stations.length, total: results.length,
  success: results.filter(r => r.success).length, results };
fs.writeFileSync('reports/metro-routing-benchmark.json', JSON.stringify(report, null, 2) + '\n');
console.log(`Accepted ${report.success}/${report.total}`);
