export function addRecentPlace(previous, place) {
  if (!place || place.id === "my-location" || !place.id || !place.name ||
      !Number.isFinite(place.lat) || !Number.isFinite(place.lon)) return previous;
  const keep = {};
  for (const key of ["id", "name", "kind", "lat", "lon", "address", "sourceId", "station", "stationCode", "stationCodes", "exit", "elevator", "elevatorUpdatedAt", "officialAccessible", "description", "openingHours", "phone", "accessibleCount", "slopePct", "careBed", "routes", "wheelchair", "landmark"]) {
    if (place[key] != null || (key === "elevator" && key in place)) keep[key] = place[key];
  }
  return [keep, ...previous.filter((item) => item.id !== keep.id)].slice(0, 10);
}
