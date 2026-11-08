import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {readRoutingAsset} from '../server/routing-assets.mjs';

test('server assets are decompressed correctly while metadata remains unchanged',async()=>{
 const compressed=await readFile('public/data/official-conditions.json.gz');
 const result=await readRoutingAsset('http://route-data.internal/data/official-conditions.json.gz');assert.deepEqual(result,gunzipSync(compressed));
 const metadata=await readFile('public/data/official-sidewalk-reference.meta.json');assert.deepEqual(await readRoutingAsset('http://route-data.internal/data/official-sidewalk-reference.meta.json'),metadata);
});
test('server assets cannot fetch external URLs or unlisted files',async()=>{
 for(const url of ['https://outside.example/data/graph.json.gz','http://route-data.internal/data/secret.json','http://route-data.internal/data/graph.json.gz/other'])await assert.rejects(readRoutingAsset(url),/ROUTING_ASSET_INVALID/);
});
