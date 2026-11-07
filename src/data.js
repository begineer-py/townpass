import { gunzipSync } from "fflate";
export const dataUrl = (name) =>
  `${import.meta.env.BASE_URL}data/${name}.json.gz`;
export async function loadData(name) {
  try {
    const r = await fetch(dataUrl(name));
    if (!r.ok) throw new Error(name + ": " + r.status);
    let bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes[0] === 31 && bytes[1] === 139) bytes = gunzipSync(bytes);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (e) {
    console.error("Dataset", name, e);
    throw e;
  }
}
export const distance = (a, b) =>
  Math.hypot((a.lat - b.lat) * 111195, (a.lon - b.lon) * 100700);
export const formatDistance = (n) =>
  n >= 1000 ? `${(n / 1000).toFixed(1)} 公里` : `${Math.round(n)} 公尺`;
export const cleanName = (s) => String(s ?? "").replace(/^\d+-/, "");
export const normalize = (s) =>
  String(s ?? "")
    .replace(/臺/g, "台")
    .replace(/[\s・·（）()\-]/g, "")
    .toLowerCase();
export function category(p) {
  return (
    {
      1: "ramp",
      3: "elevator",
      4: "park",
      7: "entrance",
      8: "friendly",
      9: "toilet",
      14: "facility",
      15: "parking",
      16: "parking",
      18: "bus",
      20: "station",
      "metro-elevator": "elevator",
    }[p.kind] || p.kind
  );
}
export const labels = {
  elevator: "電梯與坡道出口",
  toilet: "無障礙廁所",
  "public-toilet": "一般公廁",
  rest: "休息座椅",
  water: "飲水處",
  park: "公園",
  friendly: "友善店家",
  ramp: "坡道",
  entrance: "出入口",
  parking: "停車設施",
  station: "捷運站",
  bus: "公車站",
  health: "醫療與藥局",
  facility: "無障礙設施",
  place: "地點",
  road: "道路",
};
export function readSaved(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
export function saveLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function rocDate(s) {
  const m = String(s || "").match(
    /(\d{2,4})[\/年.-](\d{1,2})[\/月.-](\d{1,2})/,
  );
  if (!m) return null;
  return new Date(
    Number(m[1]) + (Number(m[1]) < 1911 ? 1911 : 0),
    Number(m[2]) - 1,
    Number(m[3]),
  );
}
export function currentConstruction(rows, now = new Date()) {
  return rows.filter((r) => {
    const a = rocDate(r.Cb_Da),
      b = rocDate(r.Ce_Da);
    if (!a || !b) return false;
    b.setHours(23, 59, 59);
    return (
      a <= now && b >= now && Number.isFinite(r.lat) && Number.isFinite(r.lon)
    );
  });
}
