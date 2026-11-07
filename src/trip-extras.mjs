import { category, distance, normalize } from "./data.js";
import { stationKey } from "./format.mjs";

export const IDENTITIES = [
  ["wheelchair", "輪椅", { minWidth: 0.9, maxSlope: 5, mode: "gentle", largeText: false }],
  ["stroller", "嬰兒推車", { minWidth: 0.8, maxSlope: 8, mode: "crossings", largeText: false }],
  ["senior", "樂齡", { minWidth: 0.8, maxSlope: 5, mode: "gentle", largeText: true }],
];

export const DEMOS = [
  {
    name: "大安森林公園",
    start: { id: "w7-720", name: "大安森林公園_11號出入口", sourceId: "wheel-7" },
    end: { id: "w7-727", name: "大安森林公園_4號出入口", sourceId: "wheel-7" },
  },
  {
    name: "信義",
    start: { id: "w7-810", name: "台北101/世貿站出口4-4", sourceId: "wheel-7" },
    end: { id: "w7-438", name: "松壽廣場_6號出入口", sourceId: "wheel-7" },
  },
  {
    name: "北投",
    start: { id: "metro-exits-65", name: "北投站出口無障礙坡道1", sourceId: "metro-exits" },
    end: { id: "w7-341", name: "233號七星公園_4號出入口", sourceId: "wheel-7" },
  },
];

// Never invent an entrance when the official source is missing, changed, or
// duplicated. Resolve the actual current coordinates and restriction fields.
export function resolveDemo(demo,facilities){
 if(!Array.isArray(facilities))return null;
 const resolve=ref=>{
  if(!ref?.id||!ref?.name||!ref?.sourceId)return null;
  const matches=facilities.filter(p=>p.id===ref.id);
  if(matches.length!==1)return null;
  const p=matches[0];
  return p.name===ref.name&&p.sourceId===ref.sourceId&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)?p:null;
 };
 const start=resolve(demo?.start),end=resolve(demo?.end);
 return start&&end?{start,end}:null;
}

export const PHONES = { metro: "02-2181-2345", city: "1999" };

export function mapLink(start, end) {
  return `https://maps.google.com/maps?saddr=${start.lat},${start.lon}&daddr=${end.lat},${end.lon}&dirflg=w`;
}

export function identityFromUser(info) {
  const raw = info?.identity || info?.access || info?.disability || info?.assistive;
  const text = String(raw || "");
  if (/輪椅|wheelchair/i.test(text)) return "wheelchair";
  if (/嬰兒車|推車|stroller/i.test(text)) return "stroller";
  if (/樂齡|長輩|senior/i.test(text)) return "senior";
  return null;
}

export function parseTripSentence(text) {
  const s = String(text || "").replace(/臺/g, "台").trim();
  let identity = null;
  if (/嬰兒車|推車/.test(s)) identity = "stroller";
  else if (/輪椅/.test(s)) identity = "wheelchair";
  else if (/樂齡|長輩/.test(s)) identity = "senior";
  let stop = null;
  if (/廁所/.test(s)) stop = "toilet";
  else if (/椅|歇腳|休息/.test(s)) stop = "rest";
  const m = s.match(/從(.+?)到(.+?)(?:[，,。]|順便|$)/);
  return {
    identity,
    stop,
    startName: m?.[1]?.trim() || "",
    endName: m?.[2]?.trim() || "",
  };
}

export function matchPlace(name, places) {
  const q = normalize(name);
  if (!q || !places?.length) return null;
  const hits = places.filter((p) => {
    const n = normalize(p.name);
    return n && (n.includes(q) || q.includes(n));
  });
  hits.sort(
    (a, b) =>
      (normalize(a.name) === q ? 0 : 1) - (normalize(b.name) === q ? 0 : 1) ||
      a.name.length - b.name.length,
  );
  return hits[0] || null;
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
