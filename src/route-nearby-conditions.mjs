import {metres} from './routing.mjs';

// Mark short parts of verified route geometry near an official observation.
// Proximity is not proof that the observation affects this side of the road.
export function createNearbyConditionAnnotator(index) {
  const cache = new Map();
  const near = (a, b) => {
    if (!index) return null;
    const key = [a.join(','), b.join(',')].sort().join('|');
    if (!cache.has(key)) {
      if (cache.size >= 50000) cache.clear();
      cache.set(key, index.find([a, b], 2).length > 0);
    }
    return cache.get(key);
  };
  return route => {
    if (!route || route.error || !Array.isArray(route.tierSegments)) return route;
    const segments = [];
    for (const segment of route.tierSegments) {
      const points = segment.coordinates;
      if (!Array.isArray(points) || points.length < 2) { segments.push(segment); continue; }
      // Most segments have no nearby record. Preserve their original geometry
      // and avoid splitting or scanning every 10 metres in that common case.
      if (!index || index.find(points, 2).length === 0) {
        segments.push({...segment, nearbyOfficialCondition:index ? false : null});
        continue;
      }
      const total = points.slice(1).reduce((sum, p, i) => sum + metres(points[i], p), 0);
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i], len = metres(a, b);
        const count = Math.max(1, Math.ceil(len / 10));
        for (let j = 0; j < count; j++) {
          const point = t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          const start = point(j / count), end = point((j + 1) / count);
          const nearbyOfficialCondition = near(start, end);
          const distance = total > 0 ? (segment.distance || 0) * len / count / total : 0;
          const last = segments.at(-1);
          if (last?._source === segment && last.nearbyOfficialCondition === nearbyOfficialCondition) {
            last.coordinates.push(end); last.distance += distance;
          } else segments.push({...segment, coordinates:[start, end], distance, nearbyOfficialCondition, _source:segment});
        }
      }
    }
    return {...route, tierSegments:segments.map(({_source, ...segment}) => segment)};
  };
}
