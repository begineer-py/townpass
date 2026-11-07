export const OFFICIAL_SIDEWALK_URL =
  "https://tppano.gov.taipei/tp_roadsidewalkplatform_be/api/C00/C10/C11_mapStreetView/sidewalk_accessiblePassageway";
export const OFFICIAL_SIDEWALK_SOURCE =
  "https://tppano.gov.taipei/tp_roadsidewalkplatform_public/";

let request;

export function parseSidewalkWkt(value, id = "") {
  const text = String(value || "").trim();
  if (!/^MULTILINESTRING\s*\(/i.test(text) || text.length > 100_000)
    return [];
  const lines = [];
  for (const match of text.matchAll(/\(\s*([^()]+?)\s*\)/g)) {
    const coordinates = match[1]
      .split(",")
      .map((pair) => pair.trim().split(/\s+/).slice(0, 2).map(Number))
      .filter(
        (pair) =>
          pair.length === 2 &&
          pair.every(Number.isFinite) &&
          pair[0] > 100_000 &&
          pair[0] < 400_000 &&
          pair[1] > 2_600_000 &&
          pair[1] < 2_900_000,
      );
    if (coordinates.length < 2) continue;
    const xs = coordinates.map((point) => point[0]);
    const ys = coordinates.map((point) => point[1]);
    lines.push({
      id: String(id),
      coordinates,
      bounds: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    });
  }
  return lines;
}

export function parseOfficialSidewalks(payload) {
  if (
    payload?.code !== "101" ||
    !Array.isArray(payload.data) ||
    payload.data.length > 100_000
  )
    throw new Error("INVALID_OFFICIAL_SIDEWALKS");
  return payload.data.flatMap((row) =>
    parseSidewalkWkt(row?.STAsText, row?.qgs_fid),
  );
}

// 網頁讀取由 scripts/build_sidewalks.mjs 預先整理的 public/data/sidewalks.json.gz
// （約 1.5 MB，已是 WGS84），不再每次向市府 API 下載未壓縮的約 9.5 MB。
// 每條線為 [南, 西, 北, 東, 緯, 經, …]，數值 × scale。
export function decodeSidewalks(payload) {
  const scale = Number(payload?.scale) || 1e6;
  if (!Array.isArray(payload?.lines)) throw new Error("INVALID_SIDEWALKS");
  return payload.lines
    .filter((row) => Array.isArray(row) && row.length >= 8)
    .map((row) => {
      const latLngs = [];
      for (let i = 4; i + 1 < row.length; i += 2) latLngs.push([row[i] / scale, row[i + 1] / scale]);
      return {
        bounds: [row[0] / scale, row[1] / scale, row[2] / scale, row[3] / scale],
        latLngs,
      };
    });
}

export function visibleSidewalkLines(features, bounds) {
  const south = bounds.getSouth(), west = bounds.getWest(),
    north = bounds.getNorth(), east = bounds.getEast();
  return features
    .filter(({ bounds: [minLat, minLon, maxLat, maxLon] }) =>
      maxLat >= south && minLat <= north && maxLon >= west && minLon <= east,
    )
    .map((feature) => feature.latLngs);
}

export async function loadOfficialSidewalks() {
  if (!request) {
    request = import("./data.js")
      .then(({ loadData }) => loadData("sidewalks"))
      .then(decodeSidewalks)
      .catch((error) => {
        request = null;
        throw error;
      });
  }
  return request;
}
