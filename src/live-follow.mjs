// Position updates drive route previews only; they do not certify that an
// estimated line is physically accessible or safe to traverse.
export function displayedRouteCoordinates(route) {
  // The display line includes unconfirmed approaches; using it here changes
  // only deviation detection and does not change their verification status.
  return Array.isArray(route?.coordinates) && route.coordinates.length >= 2
    ? route.coordinates : route?.networkCoordinates;
}
export function distanceToRoute(point, coordinates) {
  if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite) ||
      !Array.isArray(coordinates) || coordinates.length < 2) return Infinity;
  let best = Infinity;
  for (let i = 1; i < coordinates.length; i++) {
    const a = coordinates[i - 1], b = coordinates[i];
    if (!Array.isArray(a) || !Array.isArray(b) || !a.slice(0, 2).every(Number.isFinite) || !b.slice(0, 2).every(Number.isFinite)) continue;
    const y = (b[0] - a[0]) * 111195, x = (b[1] - a[1]) * 100700;
    const py = (point[0] - a[0]) * 111195, px = (point[1] - a[1]) * 100700;
    const t = Math.max(0, Math.min(1, (py * y + px * x) / (x * x + y * y || 1)));
    best = Math.min(best, Math.hypot(py - t * y, px - t * x));
  }
  return best;
}

export function createLiveFollow({coordinates, onPosition, onReplan, onStatus, onUncertain, now = () => Date.now()}) {
  let active = true, pending = false, lastTimestamp = -Infinity, lastAttempt = -Infinity, consecutive = 0, line = coordinates;
  const status = value => onStatus?.(value);
  return {
    sample(position) {
      if (!active) return;
      const timestamp = position?.timestamp, accuracy = position?.accuracy, current = now();
      if (!Number.isFinite(timestamp) || timestamp > current + 5000 || current - timestamp > 30000 ||
          !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 30 ||
          !Number.isFinite(position?.lat) || !Number.isFinite(position?.lon)) {
        consecutive = 0;
        pending = false;
        onUncertain?.();
        status('uncertain');
        return;
      }
      // Cached / out-of-order samples do not count as two independent fixes.
      if (timestamp <= lastTimestamp) return;
      lastTimestamp = timestamp;
      onPosition?.(position);
      if (!active) return;
      const distance = distanceToRoute([position.lat, position.lon], line);
      if (!Number.isFinite(distance)) { consecutive = 0; status('unavailable'); return; }
      // At good precision, a small genuine deviation can trigger recovery;
      // at low precision the threshold expands to avoid GPS jitter.
      if (distance + 0.01 < Math.max(5, accuracy * 1.25)) { consecutive = 0; if (!pending) status('following'); return; }
      consecutive++;
      if (pending || consecutive < 2 || current - lastAttempt < 15000) return;
      pending = true;
      consecutive = 0;
      lastAttempt = current;
      status('replanning');
      onReplan?.(position);
    },
    complete(coordinates) {
      if (!active) return;
      pending = false;
      if (Array.isArray(coordinates) && coordinates.length >= 2) { line = coordinates; status('following'); }
      else status('failed');
    },
    isPending() { return pending; },
    stop() { active = false; pending = false; },
  };
}
