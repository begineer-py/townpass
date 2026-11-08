import { parentPort } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { webcrypto } from 'node:crypto';

// The routing engine expects Worker globals and same-origin static data.
// Only these bundled files may be read; requests never choose a filesystem path.
const assets = new Set(['graph.json.gz','facilities.json.gz','places.json.gz','official-conditions.json.gz','official-sidewalk-reference.json.gz','official-sidewalk-reference.meta.json']);
if (!globalThis.crypto) globalThis.crypto = webcrypto;
globalThis.self = globalThis;
globalThis.postMessage = message => parentPort.postMessage(message);
globalThis.fetch = async input => {
  const url = new URL(String(input));
  const name = url.pathname.split('/').at(-1);
  if (url.origin !== 'http://route-data.internal' || !assets.has(name)) throw Error('ROUTING_ASSET_INVALID');
  const bytes = await readFile(join(process.cwd(), 'public', 'data', name));
  return new Response(bytes, {status:200, headers:{'Content-Type':name.endsWith('.json')?'application/json':'application/octet-stream'}});
};
await import('../src/route-worker.js');
parentPort.on('message', data => { void globalThis.onmessage({data}); });
