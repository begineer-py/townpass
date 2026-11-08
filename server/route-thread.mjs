import { parentPort } from 'node:worker_threads';
import { webcrypto } from 'node:crypto';
import { readRoutingAsset } from './routing-assets.mjs';

// The routing engine expects Worker globals and same-origin static data.
if (!globalThis.crypto) globalThis.crypto = webcrypto;
globalThis.self = globalThis;
globalThis.postMessage = message => parentPort.postMessage(message);
globalThis.fetch = async input => {
  const bytes=await readRoutingAsset(input);
  return new Response(bytes, {status:200});
};
await import('../src/route-worker.js');
parentPort.on('message', data => { void globalThis.onmessage({data}); });
