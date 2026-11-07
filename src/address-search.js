import { addressNorm } from "./format.mjs";
let indexPromise;
const cache = new Map();
const norm = addressNorm;
export async function landmarkSearch(query, signal) {
  if (query.trim().length < 2 || query.trim().length > 60) return [];
  const response = await fetch(`${import.meta.env.BASE_URL}api/landmark-search?q=${encodeURIComponent(query.trim())}`, {signal});
  if (!response.ok) return [];
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}
export async function addressSearch(query, signal) {
  if (!/[路街]/.test(query)) return [];
  indexPromise ??= fetch(`${import.meta.env.BASE_URL}data/address-index.json`)
    .then((r) => {
      if (!r.ok) throw Error("index");
      return r.json();
    })
    .catch((e) => {
      indexPromise = null;
      throw e;
    });
  const idx = await indexPromise,
    q = norm(query);
  const matching = idx
    .filter((x) => {
      const road = norm(x.street).replace(
        /^.*?[區鄉鎮市](?=[^區鄉鎮市]*[路街])/,
        "",
      );
      return q.includes(road) || norm(x.street).includes(q);
    })
    .slice(0, 8);
  const groups = await Promise.all(
    matching.map(async (x) => {
      if (!cache.has(x.file)) {
        const r = await fetch(
          `${import.meta.env.BASE_URL}data/addresses/${x.file}.json`,
          { signal },
        );
        if (!r.ok) return [];
        cache.set(x.file, await r.json());
        if (cache.size > 20) cache.delete(cache.keys().next().value);
      }
      return cache.get(x.file) || [];
    }),
  );
  return groups
    .flat()
    .filter((x) => norm(x[0]).includes(q))
    .slice(0, 30)
    .map((x, i) => ({
      name: x[0],
      lat: x[1],
      lon: x[2],
      id: `address-${x[1]}-${x[2]}-${i}`,
      kind: "place",
      sourceId: "osm",
    }));
}
