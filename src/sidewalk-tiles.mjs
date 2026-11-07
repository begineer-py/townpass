import { gunzipSync } from "fflate";

const base = `${(import.meta.env?.BASE_URL || "/")}data/sidewalk-tiles/`;
let manifestPromise;
const cache = new Map();

export function tilesForBounds(bounds, center, available) {
  const result = [];
  for (let lat = Math.floor(bounds[0] * 100); lat <= Math.floor(bounds[2] * 100); lat++)
    for (let lon = Math.floor(bounds[1] * 100); lon <= Math.floor(bounds[3] * 100); lon++) {
      const key = `${lat}-${lon}`;
      if (available.has(key)) result.push({key, distance: Math.hypot(lat + .5 - center.lat * 100, lon + .5 - center.lng * 100)});
    }
  return result.sort((a, b) => a.distance - b.distance).map(({key}) => key);
}

export async function sidewalkManifest() {
  manifestPromise ??= fetch(`${base}index.json`).then(r => {
    if (!r.ok) throw Error("sidewalk index");
    return r.json();
  }).catch(error => { manifestPromise = undefined; throw error; });
  return manifestPromise;
}

export async function sidewalkTile(key) {
  if (cache.has(key)) {
    const cached = cache.get(key);
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }
  const promise = fetch(`${base}${key}.json.gz`).then(async r => {
    if (!r.ok) throw Error("sidewalk tile");
    let bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes[0] === 31 && bytes[1] === 139) bytes = gunzipSync(bytes);
    const tile = JSON.parse(new TextDecoder().decode(bytes));
    return tile.lines.map(([id, ...coords]) => {
      const points = [];
      for (let i = 0; i + 1 < coords.length; i += 2) points.push([coords[i] / tile.scale, coords[i + 1] / tile.scale]);
      return {id, points};
    });
  }).catch(error => { if (cache.get(key) === promise) cache.delete(key); throw error; });
  cache.set(key, promise);
  if (cache.size > 80) cache.delete(cache.keys().next().value);
  return promise;
}

