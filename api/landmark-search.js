const upstream = 'https://tppano.gov.taipei/tp_roadsidewalkplatform_be/api/Z00/taipeiApi';

// Fixed public landmark lookup only; do not forward cookies or identity.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const send = (status, data) => { res.statusCode = status; res.end(JSON.stringify(data)); };
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(405, {error:'METHOD_NOT_ALLOWED'}); }
  const keyword = new URL(req.url, 'http://localhost').searchParams.get('q')?.trim() || '';
  if (keyword.length < 2 || keyword.length > 60) return send(400, {error:'INVALID_QUERY'});
  const url = new URL(upstream);
  url.search = new URLSearchParams({ SERVICE:'SEARCHLANDMARK', KEYWORD:keyword, SRS_T:'WGS84' });
  try {
    const response = await fetch(url, { signal:AbortSignal.timeout(10000) });
    if (!response.ok) return send(502, {error:'UPSTREAM_UNAVAILABLE'});
    const data = await response.json();
    if (!Array.isArray(data)) return send(502, {error:'UPSTREAM_INVALID'});
    const places = data.slice(0, 50).flatMap((item, index) => {
      const lat = Number(item.y), lon = Number(item.x);
      if (typeof item.markName !== 'string' || !item.markName.trim() || item.x == null || item.y == null ||
          !Number.isFinite(lat) || !Number.isFinite(lon) || lat < 24.9 || lat > 25.3 || lon < 121.4 || lon > 121.8) return [];
      return [{id:`taipei-landmark-${lat}-${lon}-${index}`,kind:'place',name:item.markName.trim(),lat,lon,sourceId:'taipei-landmark'}];
    });
    return send(200, places);
  } catch { return send(502, {error:'UPSTREAM_UNAVAILABLE'}); }
}
