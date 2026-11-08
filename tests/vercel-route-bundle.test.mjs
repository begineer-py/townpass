import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import picomatch from 'picomatch';

test('Vercel route function glob fits the schema and includes all required assets',()=>{
 const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url)));
 const pattern=config.functions['api/route-compute.js'].includeFiles;
 assert.ok(pattern.length<=256,`includeFiles is ${pattern.length} characters`);
 const matches=picomatch(pattern);
 for(const path of ['server/route-thread.mjs','server/route-pool.mjs','server/official-plan.mjs','src/route-worker.js','node_modules/fflate/package.json','public/data/graph.json.gz','public/data/facilities.json.gz','public/data/places.json.gz','public/data/official-conditions.json.gz','public/data/official-sidewalk-reference.json.gz','public/data/official-sidewalk-reference.meta.json']){
  assert.ok(existsSync(path),`${path} is missing`);assert.ok(matches(path),`${path} not included`);
 }
 assert.equal(matches('public/data/facility-tiles/123.json.gz'),false);
});
