// Derive a browser asset from a captured official provenance sidecar. This is
// reference data, not the original downloaded response or a verified network.
import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync,gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {makeReferenceAsset} from '../src/reference-asset.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const input=path.join(root,'data/processed/official-sidewalk-provenance.json.gz');
const output=path.join(root,'public/data/official-sidewalk-reference.json.gz');
const manifestPath=path.join(root,'public/data/official-sidewalk-reference.meta.json');
const source=JSON.parse(gunzipSync(fs.readFileSync(input)));
const body=makeReferenceAsset(source);
const json=Buffer.from(JSON.stringify(body)),bytes=gzipSync(json,{level:9,mtime:0});
const sha256=createHash('sha256').update(bytes).digest('hex');
const manifest={schemaVersion:1,sourceHash:body.sourceHash,assetSha256:sha256,jsonSha256:createHash('sha256').update(json).digest('hex'),parts:body.parts.length};
fs.writeFileSync(output+'.next',bytes);fs.writeFileSync(manifestPath+'.next',JSON.stringify(manifest,null,2)+'\n');
fs.renameSync(output+'.next',output);fs.renameSync(manifestPath+'.next',manifestPath);
console.log(JSON.stringify({output,parts:body.parts.length,sourceHash:body.sourceHash,bytes:bytes.length,sha256}));
