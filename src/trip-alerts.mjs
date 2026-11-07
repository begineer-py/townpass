import { createConstructionChecker } from './construction.mjs';

// A saved line is used only to detect an affected trip; navigation is recalculated.
export function inspectSavedTrips(trips, snapshot, now = Date.now()) {
  const checker = createConstructionChecker(snapshot, now);
  const alerts = {};
  for (const trip of trips) {
    if (!Array.isArray(trip.route?.coordinates) || !trip.route.coordinates.length) continue;
    try {
      const blocked = checker.inspect(trip.route.coordinates).blocked;
      if (blocked.length) alerts[trip.id] = blocked;
    } catch {
      // Old or invalid saved geometry cannot be monitored.
    }
  }
  return alerts;
}

export function alertFingerprint(works) {
  return works.map(w => `${w.id}:${w.start}:${w.end}:${w.hours}:${w.impact}`).sort().join('|');
}

export function notifyTownPass(title, content) {
  try {
    const bridge = globalThis.window?.flutterObject;
    if (!bridge?.postMessage) return false;
    bridge.postMessage(JSON.stringify({ name: 'notify', data: { title, content } }));
    return true;
  } catch { return false; }
}
