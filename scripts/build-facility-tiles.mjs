import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
const dir = 'public/data/facility-tiles';
mkdirSync(dir, { recursive: true });
const read = (name) => JSON.parse(gunzipSync(readFileSync(`public/data/${name}.json.gz`)));
const allowed = new Set(['metro-elevator', '1', '3', '4', '7', '8', '9', 'park', 'place', '14', '15', '16', '18', 'toilet', 'public-toilet', 'rest', 'water', 'health', 'elevator', 'friendly', 'parking', 'facility']);
const tiles = new Map();
for (const p of [...read('facilities'), ...read('places')]) {
  if (!allowed.has(String(p.kind)) || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
  const key = `${Math.floor(p.lat * 100)}_${Math.floor(p.lon * 100)}`;
  const list = tiles.get(key) || [];
  list.push(p);
  tiles.set(key, list);
}
for (const [key, values] of tiles) writeFileSync(`${dir}/${key}.json.gz`, gzipSync(Buffer.from(JSON.stringify(values)), { level: 9 }));
writeFileSync(`${dir}/index.json`, JSON.stringify([...tiles.keys()].sort()));
console.log(`Facility tiles: ${tiles.size} tiles, ${[...tiles.values()].reduce((n, v) => n + v.length, 0)} locations`);
