import { useEffect, useRef, useState } from 'react';
import { gunzipSync } from 'fflate';
import { facilityTileKeys } from './facility-tiles.mjs';
import './facility-tiles.css';

export function useFacilityTiles(viewport, enabled) {
  const [places, setPlaces] = useState([]);
  const [status, setStatus] = useState('idle');
  const [retryVersion, setRetryVersion] = useState(0);
  const cache = useRef(new Map()), manifest = useRef(null);
  const keys = enabled && viewport.zoom >= 16 ? facilityTileKeys(viewport.bounds, viewport.lat, viewport.lon) : [];
  const signature = [...keys].sort().join(',');
  useEffect(() => {
    if (!signature) { setPlaces([]); setStatus('idle'); return; }
    const controller = new AbortController();
    const wanted = keys;
    const base = `${import.meta.env.BASE_URL}data/facility-tiles/`;
    const publish = () => { if (!controller.signal.aborted) setPlaces(wanted.flatMap((key) => cache.current.get(key) || [])); };
    setStatus('loading');
    (async () => {
      if (!manifest.current) {
        const response = await fetch(`${base}index.json`, { signal: controller.signal });
        if (!response.ok) throw Error('facility tile index');
        const index = await response.json();
        if (!Array.isArray(index)) throw Error('invalid facility tile index');
        manifest.current = new Set(index);
      }
      const pending = wanted.filter((key) => manifest.current.has(key) && !cache.current.has(key));
      let failed = false;
      publish();
      async function worker() {
        while (pending.length && !controller.signal.aborted) {
          const key = pending.shift();
          try {
            const response = await fetch(`${base}${key}.json.gz`, { signal: controller.signal });
            if (!response.ok) throw Error('facility tile');
            const bytes = new Uint8Array(await response.arrayBuffer());
            const rows = JSON.parse(new TextDecoder().decode(bytes[0] === 31 && bytes[1] === 139 ? gunzipSync(bytes) : bytes));
            if (!Array.isArray(rows)) throw Error('invalid facility tile');
            cache.current.set(key, rows);
            if (cache.current.size > 100) cache.current.delete(cache.current.keys().next().value);
            publish();
          } catch (error) { if (error.name === 'AbortError') return; failed = true; }
        }
      }
      await Promise.all(Array.from({ length: Math.min(4, pending.length) }, worker));
      if (!controller.signal.aborted) setStatus(failed ? 'error' : 'ready');
    })().catch((error) => { if (error.name !== 'AbortError' && !controller.signal.aborted) setStatus('error'); });
    return () => controller.abort();
  }, [signature, retryVersion]);
  return { places, status, retry: () => setRetryVersion((value) => value + 1) };
}
