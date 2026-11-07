// Query bounds of the Taipei route service; not a coverage/accessibility guarantee.
export function pointError(point) {
  if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite))
    return "OFFICIAL_INVALID_POINTS";
  const [lat, lon] = point;
  return lat < 24.9 || lat > 25.3 || lon < 121.4 || lon > 121.8
    ? "OFFICIAL_OUTSIDE_COVERAGE" : null;
}

export function requestError(error) {
  return error?.name === "AbortError" || error?.name === "TimeoutError"
    ? "OFFICIAL_TIMEOUT" : "OFFICIAL_NETWORK";
}
