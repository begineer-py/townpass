const normalize = value => ((value % 360) + 360) % 360;

// Map rotation is clockwise, so both angles combine in screen coordinates.
export function markerHeading(heading, mapBearing = 0) {
  return Number.isFinite(heading) ? normalize(heading + (Number.isFinite(mapBearing) ? mapBearing : 0)) : null;
}

// Relative gyroscope alpha has no north reference and must not be used as a compass.
export function compassHeading(event, screenAngle = 0) {
  const angle = Number.isFinite(screenAngle) ? screenAngle : 0;
  if (Number.isFinite(event?.webkitCompassHeading)) {
    const accuracy = event.webkitCompassAccuracy;
    if (Number.isFinite(accuracy) && (accuracy < 0 || accuracy > 45)) return null;
    return normalize(event.webkitCompassHeading + angle);
  }
  if ((event?.absolute === true || event?.type === 'deviceorientationabsolute') && Number.isFinite(event?.alpha)) {
    // The screen's top edge has no reliable horizontal direction when vertical.
    if (Number.isFinite(event.beta) && Math.cos(event.beta * Math.PI / 180) < 0.1) return null;
    return normalize(360 - event.alpha + angle);
  }
  return null;
}

// Call directly from a user gesture: iOS requires transient activation.
export function requestHeadingPermission(win = globalThis.window) {
  try {
    const request = win?.DeviceOrientationEvent?.requestPermission;
    if (typeof request !== 'function') return Promise.resolve(true);
    return Promise.resolve(request.call(win.DeviceOrientationEvent, true)).then(value => value === 'granted', () => false);
  } catch { return Promise.resolve(false); }
}

export function watchDeviceHeading(win, onHeading, {staleMs = 10000} = {}) {
  if (!win?.addEventListener) return () => {};
  let last = null, timer = null, active = true;
  const clear = () => { last = null; onHeading(null); };
  const onOrientation = event => {
    const value = compassHeading(event, win.screen?.orientation?.angle ?? win.orientation ?? 0);
    if (value === null) return;
    const delta = last === null ? 0 : ((value - last + 540) % 360) - 180;
    last = last === null ? value : normalize(last + delta * 0.3);
    onHeading(last);
    clearTimeout(timer);
    timer = setTimeout(() => { if(active)clear(); }, staleMs);
  };
  const onVisibility = () => { if (win.document?.hidden) { clearTimeout(timer);clear(); } };
  win.addEventListener('deviceorientationabsolute', onOrientation);
  win.addEventListener('deviceorientation', onOrientation);
  win.document?.addEventListener('visibilitychange', onVisibility);
  return () => {
    active = false; clearTimeout(timer);
    win.removeEventListener('deviceorientationabsolute', onOrientation);
    win.removeEventListener('deviceorientation', onOrientation);
    win.document?.removeEventListener('visibilitychange', onVisibility);
  };
}
