import { category, distance } from "./data.js";
import { stationKey } from "./format.mjs";

export const PHONES = { metro: "02-2181-2345", city: "1999" };

export function mapLink(start, end) {
  return `https://maps.google.com/maps?saddr=${start.lat},${start.lon}&daddr=${end.lat},${end.lon}&dirflg=w`;
}

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

function segmentDistance(point, a, b) {
  const ax = a[1] * 100700;
  const ay = a[0] * 111195;
  const bx = b[1] * 100700;
  const by = b[0] * 111195;
  const px = point.lon * 100700;
  const py = point.lat * 111195;
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(
    0,
    Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)),
  );
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

export function facilitiesAlongRoute(route, places, kind, limit = 100, max = 8) {
  const coordinates = route?.coordinates || [];
  if (!coordinates.length) return [];
  return (places || [])
    .filter(
      (place) =>
        category(place) === kind &&
        Number.isFinite(place.lat) &&
        Number.isFinite(place.lon),
    )
    .map((place) => {
      let near = Infinity;
      let order = 0;
      for (let i = 0; i < Math.max(1, coordinates.length - 1); i++) {
        const value =
          coordinates.length === 1
            ? distance({ lat: coordinates[0][0], lon: coordinates[0][1] }, place)
            : segmentDistance(place, coordinates[i], coordinates[i + 1]);
        if (value < near) {
          near = value;
          order = i;
        }
      }
      return { place, near, order };
    })
    .filter(({ near }) => near <= limit)
    .sort((a, b) => a.order - b.order || a.near - b.near)
    .slice(0, max);
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
