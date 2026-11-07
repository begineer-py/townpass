export function facilityTileKeys(bounds, lat, lon) {
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite)) return [];
  const [south, west, north, east] = bounds;
  if (north < south || east < west) return [];
  const keys = [];
  const y0 = Math.max(2490, Math.floor(south * 100)), y1 = Math.min(2530, Math.floor(north * 100));
  const x0 = Math.max(12140, Math.floor(west * 100)), x1 = Math.min(12180, Math.floor(east * 100));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) keys.push(`${y}_${x}`);
  return keys.sort((a, b) => {
    const gap = (key) => { const [y, x] = key.split('_').map(Number); return Math.hypot(y / 100 + .005 - lat, x / 100 + .005 - lon); };
    return gap(a) - gap(b);
  });
}
