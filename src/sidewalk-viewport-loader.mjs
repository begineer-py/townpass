// Load a complete viewport before replacing the currently displayed lines.
export async function loadSidewalkLines(keys, getTile, isCurrent) {
  const lines = new Map();
  for (const key of keys) {
    if (!isCurrent()) return null;
    const tile = await getTile(key);
    if (!isCurrent()) return null;
    for (const line of tile) lines.set(line.id, line.points);
  }
  return isCurrent() ? [...lines.values()] : null;
}
