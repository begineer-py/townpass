import proj4 from "proj4";
import { pointError, requestError } from "./route-request.mjs";
import { metres } from "./routing.mjs";
export const OFFICIAL_ROUTE_URL =
  "https://tppano.gov.taipei/shortestAccessibleRoute/api/v1/navigation_waypoints/";
const twd97 =
  "+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs";
const toLatLon = (p) => {
  const [lon, lat] = proj4(twd97, "EPSG:4326", p.slice(0, 2));
  return [lat, lon];
};
export function normalizeOfficialRoute(payload, start, end, options = {}) {
  if (payload?.success !== true) return { error: "OFFICIAL_NO_ROUTE" };
  const m = payload.metadata,
    coords = payload.geometry_wgs84?.coordinates;
  if (
    !m ||
    m.crs !== "EPSG:3826" ||
    !Array.isArray(coords) ||
    coords.length < 2 ||
    !Number.isFinite(m.total_distance) ||
    m.total_distance <= 0
  )
    return { error: "OFFICIAL_INVALID" };
  if (
    m.used_alt !== false ||
    m.issues_count?.unfavorable !== 0 ||
    m.issues_count?.unaligned !== 0
  )
    return { error: "OFFICIAL_BLOCKED" };
  if (
    !Array.isArray(m.gap_records) ||
    m.gap_records.some(
      (g) =>
        g.inserted_issue_gap !== false ||
        !Number.isFinite(g.gap_m) ||
        g.gap_m > 0.25 ||
        g.gap_m < 0 ||
        g.snapped !== true,
    )
  )
    return { error: "OFFICIAL_GAP" };
  if (options.knownOnly) return { error: "OFFICIAL_DIMENSIONS" };
  if (
    coords.some(
      (p) =>
        !Array.isArray(p) ||
        !Number.isFinite(p[0]) ||
        !Number.isFinite(p[1]) ||
        p[0] < 121.4 ||
        p[0] > 121.8 ||
        p[1] < 24.9 ||
        p[1] > 25.3,
    )
  )
    return { error: "OFFICIAL_INVALID" };
  if (!Array.isArray(payload.segments) || !payload.segments.length)
    return { error: "OFFICIAL_INVALID" };
  if (
    Array.isArray(payload.all_segments) &&
    payload.all_segments.some((s) => s.source !== "main")
  )
    return { error: "OFFICIAL_BLOCKED" };
  const steps = [], crossingSegments = [], segmentPaths = [];
  let previousHeading = null;
  for (const seg of payload.segments) {
    if (
      seg.source !== "main" ||
      !Number.isFinite(seg.length) ||
      seg.length < 0 ||
      !Array.isArray(seg.geometry?.coordinates) ||
      seg.geometry.coordinates.length < 2
    )
      return { error: "OFFICIAL_INVALID" };
    const geometry = seg.geometry.coordinates;
    if (geometry.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1])))
      return { error: "OFFICIAL_INVALID" };
    if (
      /尚無行穿|無行穿|未設行穿|沒有行穿|無斑馬線/.test(
        String(seg.road_type || ""),
      )
    )
      return { error: "OFFICIAL_CROSSING_UNVERIFIED" };
    if (/階梯|樓梯/.test(String(seg.road_name || '') + ' ' + (seg.road_type || '')))
      return {error:'OFFICIAL_BLOCKED'};
    segmentPaths.push(geometry.map(toLatLon));
    if (/行穿|斑馬/.test(seg.road_type || '')) crossingSegments.push(geometry.map(toLatLon));
    // Tiny clipped endpoint pieces remain in route geometry but must not create 0m/U-turn instructions.
    if (seg.length < 0.5) continue;
    const [lat, lon] = toLatLon(geometry[0]),
      name = String(seg.road_name || "人行通道");
    const a = geometry[0],
      b = geometry[1],
      c = geometry.at(-2),
      d = geometry.at(-1),
      heading = (Math.atan2(b[0] - a[0], b[1] - a[1]) * 180) / Math.PI;
    const delta =
      previousHeading == null
        ? 0
        : ((heading - previousHeading + 540) % 360) - 180;
    const turn =
      Math.abs(delta) > 150
        ? "迴轉"
        : delta > 35
          ? "右轉"
          : delta < -35
            ? "左轉"
            : "直行";
    previousHeading = (Math.atan2(d[0] - c[0], d[1] - c[1]) * 180) / Math.PI;
    if (/階梯|樓梯/.test(name + " " + (seg.road_type || "")))
      return { error: "OFFICIAL_BLOCKED" };
    const last = steps.at(-1);
    if (last?.name === name && turn === "直行" && last.crossing === /行穿|斑馬/.test(seg.road_type || '')) last.distance += seg.length;
    else
      steps.push({
        name,
        distance: seg.length,
        lat,
        lon,
        turn,
        unknown: true,
        crossing: /行穿|斑馬/.test(seg.road_type || ""),
        sourceId: String(seg.qgs_fid),
      });
  }
  const coordinates = coords.map((p) => [p[1], p[0]]),
    startGap = metres(start, coordinates[0]),
    endGap = metres(end, coordinates.at(-1));
  if (!steps.length) return { error: "OFFICIAL_INVALID" };
  return {
    policyVersion: null, // Candidate only; the independent geometry verifier grants a policy version.
    provider: "taipei-official",
    coordinates,
    distance: Math.round(m.total_distance),
    steps,
    crossingSegments,
    segmentPaths,
    unknownPct: 100,
    roadPct: null,
    officialCoveragePct: null,
    startGap: Math.round(startGap),
    endGap: Math.round(endGap),
    requiresEntryConfirmation: startGap > 5 || endGap > 5,
    sourceUrl: "https://tppano.gov.taipei/tp_roadsidewalkplatform_public/",
    checkedAt: new Date().toISOString(),
    modeApplied: "official-accessible",
  };
}
export async function requestOfficialRoute(start, end, options = {}, signal, endpoint = "./api/accessible-route") {
  const invalid = pointError(start) || pointError(end) || (options.via ? pointError(options.via) : null);
  if (invalid) return { error: invalid };
  let response;
  try { response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      points: [
        { lat: start[0], lng: start[1] },
        ...(options.via ? [{lat:options.via[0],lng:options.via[1]}] : []),
        { lat: end[0], lng: end[1] },
      ],
    }),
    signal,
  }); } catch (error) { return { error: requestError(error) }; }
  if (response.status === 404 || response.status === 405)
    return { error: "OFFICIAL_NOT_CONFIGURED" };
  if (response.status === 504) return { error: "OFFICIAL_TIMEOUT" };
  const type = response.headers.get("content-type") || "";
  if (!type.includes("application/json"))
    return { error: response.ok ? "OFFICIAL_NOT_CONFIGURED" : "OFFICIAL_UNAVAILABLE" };
  let payload;
  try { payload = await response.json(); }
  catch { return { error: signal?.aborted ? "OFFICIAL_TIMEOUT" : "OFFICIAL_INVALID" }; }
  if (!response.ok) {
    const errors = {
      INVALID_POINTS: "OFFICIAL_INVALID_POINTS", OUTSIDE_COVERAGE: "OFFICIAL_OUTSIDE_COVERAGE",
      UPSTREAM_TIMEOUT: "OFFICIAL_TIMEOUT", UPSTREAM_INVALID: "OFFICIAL_INVALID",
    };
    return { error: errors[payload?.error] || "OFFICIAL_UNAVAILABLE" };
  }
  try { return normalizeOfficialRoute(payload, start, end, options); }
  catch { return { error: "OFFICIAL_INVALID" }; }
}
