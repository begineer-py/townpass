const upstream = "https://tppano.gov.taipei/shortestAccessibleRoute/api/v1/navigation_waypoints/";

export function validPoints(body) {
  return Array.isArray(body?.points) && body.points.length === 2 &&
    body.points.every(p => Number.isFinite(p?.lat) && Number.isFinite(p?.lng) &&
      p.lat >= 24.9 && p.lat <= 25.3 && p.lng >= 121.4 && p.lng <= 121.8);
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
  try {
    let body = req.body;
    if (body == null) {
      let text = "";
      for await (const chunk of req) {
        text += chunk;
        if (text.length > 2048) return send(413, { error: "TOO_LARGE" });
      }
      body = JSON.parse(text);
    } else if (typeof body === "string") body = JSON.parse(body);
    if (!validPoints(body)) return send(400, { error: "INVALID_POINTS" });
    const response = await fetch(upstream, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ points: body.points.map(({ lat, lng }) => ({ lat, lng })) }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) return send(502, { error: "UPSTREAM_UNAVAILABLE" });
    const data = await response.json();
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
    return send(error instanceof SyntaxError ? 400 : 502, { error: "ROUTE_UNAVAILABLE" });
  }
}
