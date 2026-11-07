// 下載臺北市無障礙通行路線平臺的人行道（無障礙通行線），轉成 WGS84、精簡座標後壓縮存到
// public/data/sidewalks.json.gz。網頁改讀這個檔，不必每次開啟都向市府 API 下載約 9.5 MB 未壓縮資料。
// 執行：node scripts/build_sidewalks.mjs
import fs from "node:fs";
import path from "node:path";
import proj4 from "proj4";
import { gzipSync } from "fflate";
import {
  OFFICIAL_SIDEWALK_URL,
  OFFICIAL_SIDEWALK_SOURCE,
  parseOfficialSidewalks,
} from "../src/official-sidewalks.mjs";

const TWD97 = "+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs";
const out = path.join(path.dirname(new URL(import.meta.url).pathname), "../public/data/sidewalks.json.gz");

const response = await fetch(OFFICIAL_SIDEWALK_URL, { headers: { "User-Agent": "TownPass-HaoHaoZou-data-sync" } });
if (!response.ok) throw new Error(`下載失敗：${response.status}`);
const features = parseOfficialSidewalks(await response.json());

// 座標四捨五入到 1e-6 度（約 0.1 公尺），每條線存成 [南, 西, 北, 東, 緯, 經, 緯, 經, …]（整數，×1e6）。
const E = 1e6;
const lines = features.map(({ coordinates }) => {
  const pts = coordinates.map((p) => {
    const [lon, lat] = proj4(TWD97, "EPSG:4326", p);
    return [Math.round(lat * E), Math.round(lon * E)];
  });
  const lats = pts.map((p) => p[0]), lons = pts.map((p) => p[1]);
  return [Math.min(...lats), Math.min(...lons), Math.max(...lats), Math.max(...lons), ...pts.flat()];
});
const body = JSON.stringify({
  source: OFFICIAL_SIDEWALK_SOURCE,
  fetchedAt: new Date().toISOString(),
  scale: E,
  lines,
});
const gz = gzipSync(new TextEncoder().encode(body), { level: 9 });
fs.writeFileSync(out, gz);
console.log(`人行道 ${lines.length} 條，壓縮後 ${(gz.length / 1024 / 1024).toFixed(2)} MB → ${out}`);
