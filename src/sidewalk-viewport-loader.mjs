// Fetch a bounded number of tiles at once, then publish in viewport order.
export async function loadSidewalkLines(keys, getTile, isCurrent, concurrency = 4) {
  if (!Array.isArray(keys) || !isCurrent()) return null;
  const tiles = new Array(keys.length);
  let next = 0, failed = false;
  const worker = async () => {
    while (!failed && isCurrent() && next < keys.length) {
      const index = next++;
      try {
        tiles[index] = await getTile(keys[index]);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  const workers = Math.min(keys.length, Math.max(1, Number.isFinite(concurrency) ? Math.floor(concurrency) : 4));
  await Promise.all(Array.from({length: workers}, worker));
  if (!isCurrent()) return null;
  const lines = new Map();
  for (const tile of tiles) for (const line of tile) lines.set(line.id, line.points);
  return [...lines.values()];
}
