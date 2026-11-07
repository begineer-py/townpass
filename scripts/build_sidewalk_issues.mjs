// 下載臺北市無障礙通行路線平臺的「不利通行－淨寬不足」（活動區域高／中／低）與「行穿線未設置路緣斜坡」點位，轉成 WGS84 後壓縮存到
// public/data/sidewalk-issues.json.gz。地圖在「人行道」圖層開啟時一起顯示。
// 執行：node scripts/build_sidewalk_issues.mjs
import fs from "node:fs";
import path from "node:path";
import proj4 from "proj4";
import { gzipSync } from "fflate";
import {
  OFFICIAL_SIDEWALK_SOURCE,
  SIDEWALK_ISSUES_URL,
  parseSidewalkIssues,
} from "../src/official-sidewalks.mjs";

const TWD97 = "+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs";
const out = path.join(path.dirname(new URL(import.meta.url).pathname), "../public/data/sidewalk-issues.json.gz");

const response = await fetch(SIDEWALK_ISSUES_URL, { headers: { "User-Agent": "TownPass-HaoHaoZou-data-sync" } });
if (!response.ok) throw new Error(`下載失敗：${response.status}`);
const issues = parseSidewalkIssues(await response.json());

// 座標四捨五入到 1e-6 度（約 0.1 公尺），存成 [緯, 經, 種類, 緯, 經, 種類, …]。
const E = 1e6;
const points = issues.flatMap(({ x, y, kind }) => {
  const [lon, lat] = proj4(TWD97, "EPSG:4326", [x, y]);
  return [Math.round(lat * E), Math.round(lon * E), kind];
});
const body = JSON.stringify({
  source: OFFICIAL_SIDEWALK_SOURCE,
  fetchedAt: new Date().toISOString(),
  scale: E,
  points,
});
const gz = gzipSync(new TextEncoder().encode(body), { level: 9 });
fs.writeFileSync(out, gz);
const counts = [0, 1, 2, 3].map((k) => issues.filter((i) => i.kind === k).length);
console.log(`不利通行 高 ${counts[0]}、中 ${counts[1]}、低 ${counts[2]}；行穿線無斜坡 ${counts[3]}，壓縮後 ${(gz.length / 1024).toFixed(0)} KB → ${out}`);
