import { distance } from "./data.js";

// A chosen elevator is already an explicit entrance; only suggest alternatives
// for the other endpoint, without implying that the connector was verified.
export function nearbyEntranceChoices(start, end, facilities = []) {
  return [["start", start], ["end", end]].flatMap(([which, point]) => {
    if (!point || point.kind === "metro-elevator") return [];
    const opposite = which === "start" ? end : start;
    const picked = [];
    const candidates = facilities
      .filter((place) => place.kind === "metro-elevator")
      .map((place) => ({ ...place, gap: distance(point, place) }))
      .filter((place) => place.gap >= 3 && place.gap <= 300)
      .filter((place) => !opposite || ((place.id == null || place.id !== opposite.id) && distance(place, opposite) >= 3))
      .sort((a, b) => a.gap - b.gap);
    for (const place of candidates) {
      if (picked.some((other) => distance(other, place) < 20)) continue;
      picked.push(place);
      if (picked.length === 2) break;
    }
    return picked.map((place) => ({ which, p: place }));
  });
}
