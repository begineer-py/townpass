import proj4 from "proj4";

export const OFFICIAL_SIDEWALK_URL =
  "https://tppano.gov.taipei/tp_roadsidewalkplatform_be/api/C00/C10/C11_mapStreetView/sidewalk_accessiblePassageway";
export const OFFICIAL_SIDEWALK_SOURCE =
  "https://tppano.gov.taipei/tp_roadsidewalkplatform_public/";

const TWD97 = "+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs";
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

export function projectedBounds(bounds) {
  const corners = [
    [bounds.getWest(), bounds.getSouth()],
    [bounds.getEast(), bounds.getNorth()],
  ].map((point) => proj4("EPSG:4326", TWD97, point));
  return [
    Math.min(corners[0][0], corners[1][0]),
    Math.min(corners[0][1], corners[1][1]),
    Math.max(corners[0][0], corners[1][0]),
    Math.max(corners[0][1], corners[1][1]),
  ];
}

export function visibleSidewalkLines(features, bounds) {
  const [west, south, east, north] = projectedBounds(bounds);
  return features
    .filter(({ bounds: [minX, minY, maxX, maxY] }) =>
      maxX >= west && minX <= east && maxY >= south && minY <= north,
    )
    .map((feature) => {
      if (!feature.latLngs)
        feature.latLngs = feature.coordinates.map((point) => {
          const [lon, lat] = proj4(TWD97, "EPSG:4326", point);
          return [lat, lon];
        });
      return feature.latLngs;
    });
}

export async function loadOfficialSidewalks() {
  if (!request) {
    request = fetch(OFFICIAL_SIDEWALK_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`OFFICIAL_SIDEWALKS_${response.status}`);
        return response.json();
      })
      .then(parseOfficialSidewalks)
      .catch((error) => {
        request = null;
        throw error;
      });
  }
  return request;
}
