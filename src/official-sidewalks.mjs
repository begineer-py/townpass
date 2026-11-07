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

// 市府平臺「缺失」圖層：不利通行－淨寬不足（依活動區域分高／中／低）與行穿線未設置路緣斜坡。
// （API 欄位名稱是 missing_noCurbSlope，但平臺圖例標示為「不利通行-淨寬不足」。）
export const SIDEWALK_ISSUES_URL =
  "https://tppano.gov.taipei/tp_roadsidewalkplatform_be/api/C00/C10/C11_mapStreetView/missing_v2";
// 種類代碼：0 高、1 中、2 低、3 行穿線未設斜坡、4 分類未知。
export const SIDEWALK_ISSUE_KINDS = [
  "不利通行－淨寬不足（活動區域高）",
  "不利通行－淨寬不足（活動區域中）",
  "不利通行－淨寬不足（活動區域低）",
  "行穿線未設置路緣斜坡",
  "不利通行－淨寬不足（活動區域分類未知）",
];
const LEVEL = { 高: 0, 中: 1, 低: 2 };

function parsePoint(value) {
  const match = /^POINT\s*\(\s*([\d.]+)\s+([\d.]+)\s*\)$/i.exec(String(value || "").trim());
  if (!match) return null;
  const x = Number(match[1]), y = Number(match[2]);
  return x > 100_000 && x < 400_000 && y > 2_600_000 && y < 2_900_000 ? [x, y] : null;
}

// 回傳 TWD97 座標點 [{ x, y, kind }]；格式不對就整份拒絕。
export function parseSidewalkIssues(payload) {
  const noSlope = payload?.data?.missing_noCurbSlope,
    crosswalk = payload?.data?.missing_crosswalkNoRamp;
  if (
    payload?.code !== "101" ||
    !Array.isArray(noSlope) ||
    !Array.isArray(crosswalk) ||
    noSlope.length + crosswalk.length > 100_000
  )
    throw new Error("INVALID_SIDEWALK_ISSUES");
  const points = [];
  for (const row of noSlope) {
    const point = parsePoint(row?.STAsText),
      level = /-(高|中|低)$/.exec(String(row?.type || ""))?.[1];
    if (point) points.push({ x: point[0], y: point[1], kind: LEVEL[level] ?? 4 });
  }
  for (const row of crosswalk) {
    const point = parsePoint(row?.STAsText);
    if (point) points.push({ x: point[0], y: point[1], kind: 3 });
  }
  return points;
}

// 網頁讀 public/data/sidewalk-issues.json.gz：points 為 [緯, 經, 種類, …]，緯經 × scale。
export function decodeSidewalkIssues(payload) {
  const scale = Number(payload?.scale) || 1e6;
  if (!Array.isArray(payload?.points)) throw new Error("INVALID_SIDEWALK_ISSUES");
  const out = [];
  for (let i = 0; i + 2 < payload.points.length; i += 3) {
    const kind = payload.points[i + 2];
    if (!SIDEWALK_ISSUE_KINDS[kind]) continue;
    out.push({ lat: payload.points[i] / scale, lon: payload.points[i + 1] / scale, kind });
  }
  return out;
}

export function visibleSidewalkIssues(issues, bounds) {
  const south = bounds.getSouth(), west = bounds.getWest(),
    north = bounds.getNorth(), east = bounds.getEast();
  return issues.filter(
    ({ lat, lon }) => lat >= south && lat <= north && lon >= west && lon <= east,
  );
}

let issueRequest;
export async function loadSidewalkIssues() {
  if (!issueRequest) {
    issueRequest = import("./data.js")
      .then(({ loadData }) => loadData("sidewalk-issues"))
      .then(decodeSidewalkIssues)
      .catch((error) => {
        issueRequest = null;
        throw error;
      });
  }
  return issueRequest;
}
