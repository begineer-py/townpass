import { category, distance } from "./data.js";
import { stationKey } from "./format.mjs";

// 路線附近的停靠點與今日電梯保養出口（取自 fix/pedestrian-routes ba52f55）。

export function nearestStop(route, places, kind, limit = 150) {
  const coords = (route?.coordinates || []).filter((_, i) => i % 4 === 0);
  if (!coords.length) return null;
  let best = null;
  for (const p of places || []) {
    if (category(p) !== kind) continue;
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    let near = Infinity;
    for (const c of coords)
      near = Math.min(near, distance({ lat: c[0], lon: c[1] }, p));
    if (near > limit) continue;
    if (!best || near < best.near) best = { place: p, near };
  }
  return best;
}

function taipeiRoc(now) {
  const local = new Date(now + 8 * 3600000);
  return `${local.getUTCFullYear() - 1911}${String(local.getUTCMonth() + 1).padStart(2, "0")}${String(local.getUTCDate()).padStart(2, "0")}`;
}

function stationName(value) {
  const text = String(value || "");
  const wrapped = text.match(/\(([^()]*站)\)/) || text.match(/【([^】]*站)】/);
  return stationKey(wrapped ? wrapped[1] : text);
}

export function activeElevatorStops(data, now = Date.now()) {
  if (!data?.metro) return [];
  const day = taipeiRoc(now);
  const names = new Set();
  for (const row of data.metro["metro-maintenance"] || []) {
    if (row["民國年月日"] === day) names.add(stationName(row["車站"]));
  }
  for (const row of data.metro["metro-alerts"] || []) {
    const note = String(row["說明"] || "");
    if (/已修復|開放使用/.test(note)) continue;
    if (/停用|故障|維修|關閉/.test(note)) names.add(stationName(row["車站"]));
  }
  names.delete("");
  const points = [];
  for (const p of data.fac || []) {
    if (p.kind !== "metro-elevator" || !names.has(stationKey(p.station))) continue;
    points.push([p.lat, p.lon]);
  }
  return points;
}
