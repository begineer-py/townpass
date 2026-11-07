import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

const read = (name) => JSON.parse(gunzipSync(readFileSync(`public/data/${name}.json.gz`)));
const names = new Set(["大安森林公園", "中正紀念堂", "國父紀念館", "國立故宮博物院", "台北101", "臺北101", "臺北市立動物園", "台北市立動物園"]);
const facilities = read("facilities"), places = read("places");
const stations = facilities.filter((p) => String(p.kind) === "20");
const selected = new Map();
for (const p of places) {
  if (!names.has(p.name) || !["place", "park"].includes(p.kind)) continue;
  const key = p.name.replace(/臺/g, "台");
  const current = selected.get(key);
  if (!current || (!current.address && p.address)) selected.set(key, { ...p, landmark: true });
}
const data = JSON.stringify([...stations, ...selected.values()]);
writeFileSync("public/data/landmarks.json.gz", gzipSync(Buffer.from(data), { level: 9 }));
console.log(`Landmarks: ${stations.length} stations, ${selected.size} notable places`);
