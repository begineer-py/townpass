export const isMetroStation = (place) => String(place?.kind) === "20";
export function metroExitLabelForAccessibility(place) {
  return `捷運出入口${place?.elevator === true ? "（有電梯）" : ""}`;
}

export function focusOffsetForInset(height, bottomInset) {
  const inset = Math.min(Math.max(0, Number(bottomInset) || 0), Math.max(0, height - 120));
  return Math.round(inset / 2);
}

// The compact overview contains only station bodies and curated landmarks.
// Recent user-selected places remain available even before facilities load.
export function selectMapMarkers(items, recentPlaces, zoom) {
  const seen = new Set();
  const selected = [];
  const add = (place) => {
    if (!Number.isFinite(place?.lat) || !Number.isFinite(place?.lon)) return;
    const key = place.id != null ? `id:${place.id}` : `location:${place.lat}:${place.lon}:${place.name || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    selected.push(place);
  };
  for (const place of items || []) {
    if (zoom >= 16 || isMetroStation(place) || (place.landmark && place.kind !== "metro-elevator")) add(place);
  }
  for (const place of recentPlaces || []) add(place);
  // Keep station and exit symbols visible when nearby records overlap.
  // At street scale show official entrances ahead of the station body, so a
  // nearby station marker does not hide the exit; the exit carries its badge.
  const priority = (place) => zoom >= 17 && place.kind === "metro-exit" ? 0 : isMetroStation(place) ? 1 : place.kind === "metro-exit" ? 2 : place.kind === "metro-elevator" ? 3 : place.landmark ? 4 : 5;
  selected.sort((a, b) => priority(a) - priority(b));
  return selected;
}

// Keep each marker anchored to a real facility. Overlapping facilities are
// presented as a list, including those at identical coordinates.
export function groupMarkers(points, size = 28) {
  const cells = new Map();
  const groups = [];
  for (const point of points) {
    const col = Math.floor(point.x / size), row = Math.floor(point.y / size);
    let nearest = null, nearestDistance = Infinity;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const group of cells.get(`${col + dx}:${row + dy}`) || []) {
          const x = Math.abs(group.x - point.x), y = Math.abs(group.y - point.y);
          const distance = x * x + y * y;
          if (x < size && y < size && distance < nearestDistance) {
            nearest = group;
            nearestDistance = distance;
          }
        }
      }
    }
    if (nearest) {
      nearest.points.push(point);
    } else {
      const group = { x: point.x, y: point.y, points: [point] };
      const key = `${col}:${row}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(group);
      groups.push(group);
    }
  }
  return groups;
}
