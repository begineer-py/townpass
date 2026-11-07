export function nearestSheetSnapIndex(
  height,
  maxHeight,
  viewportHeight,
  snaps,
) {
  if (
    !Number.isFinite(height) ||
    !Number.isFinite(viewportHeight) ||
    viewportHeight <= 0 ||
    !Array.isArray(snaps) ||
    !snaps.length
  )
    return 0;
  const max = Number.isFinite(maxHeight) ? maxHeight : Infinity;
  let best = 0;
  for (let i = 1; i < snaps.length; i++) {
    const target = Math.min(max, snaps[i] * viewportHeight);
    const current = Math.min(max, snaps[best] * viewportHeight);
    if (Math.abs(target - height) < Math.abs(current - height)) best = i;
  }
  return best;
}
