import { pointError } from "../src/route-request.mjs";
const upstream = "https://tppano.gov.taipei/shortestAccessibleRoute/api/v1/navigation_waypoints/";

export function validPoints(body) {
  return Array.isArray(body?.points) && body.points.length === 2 &&
    body.points.every(p => !pointError([p?.lat, p?.lng]));
}

// A fixed read-only route query, never an arbitrary URL proxy. No identity or cookies forwarded.
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  const send = (status, value) => { res.statusCode = status; res.end(JSON.stringify(value)); };
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(405, { error: "METHOD_NOT_ALLOWED" });
  }
  let body;
  try {
    body = req.body;
    if (body == null) {
      let text = "";
      for await (const chunk of req) {
        text += chunk;
        if (text.length > 2048) return send(413, { error: "TOO_LARGE" });
      }
      body = JSON.parse(text);
    } else if (typeof body === "string") body = JSON.parse(body);
  } catch { return send(400, { error: "INVALID_POINTS" }); }
  if (!Array.isArray(body?.points) || body.points.length !== 2)
    return send(400, { error: "INVALID_POINTS" });
  const errors = body.points.map(p => pointError([p?.lat, p?.lng]));
  if (errors.includes("OFFICIAL_INVALID_POINTS")) return send(400, { error: "INVALID_POINTS" });
  if (errors.includes("OFFICIAL_OUTSIDE_COVERAGE")) return send(422, { error: "OUTSIDE_COVERAGE" });
  try {
    const response = await fetch(upstream, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points: body.points.map(({ lat, lng }) => ({ lat, lng })) }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return send(502, { error: "UPSTREAM_UNAVAILABLE" });
    let data;
    try { data = await response.json(); }
    catch (error) {
      if (error.name === "TimeoutError" || error.name === "AbortError") throw error;
      return send(502, { error: "UPSTREAM_INVALID" });
    }
    // The upstream metadata includes internal server paths. Return only routing evidence.
    const { crs, total_distance, used_alt, issues_count, gap_records } = data.metadata || {};
    const segment = s => ({ source: s.source, length: s.length, road_name: s.road_name,
      road_type: s.road_type, qgs_fid: s.qgs_fid, geometry: s.geometry });
    return send(200, { success: data.success,
      metadata: { crs, total_distance, used_alt, issues_count, gap_records },
      geometry_wgs84: data.geometry_wgs84,
      segments: Array.isArray(data.segments) ? data.segments.map(segment) : null,
      all_segments: Array.isArray(data.all_segments) ? data.all_segments.map(segment) : null });
  } catch (error) {
    const timeout = error.name === "TimeoutError" || error.name === "AbortError";
    return send(timeout ? 504 : 502, { error: timeout ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE" });
  }
}
