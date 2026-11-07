const stationName = value => String(value || '').normalize('NFKC').replace(/臺/g,'台')
  .replace(/\s/g,'').replace(/\([^)]*\).*$/,'').replace(/站$/,'');

// A city landmark named exactly as a metro station can reuse the documented
// station record, which enables the existing accessible-exit lookup. Never
// infer an entrance from a generic landmark or from name alone.
export function matchStationLandmark(place, facilities) {
  if (place?.sourceId !== 'taipei-landmark' || !/站$/.test(place.name || '') ||
      !Number.isFinite(place.lat) || !Number.isFinite(place.lon)) return place;
  const key = stationName(place.name);
  let best, bestDistance = Infinity;
  for (const station of facilities || []) {
    if (String(station.kind) !== '20' || stationName(station.name) !== key ||
        !Number.isFinite(station.lat) || !Number.isFinite(station.lon)) continue;
    const distance = Math.hypot((station.lat-place.lat)*111195,(station.lon-place.lon)*100700);
    if (distance <= 250 && distance < bestDistance) { best = station; bestDistance = distance; }
  }
  return best || place;
}
