// 下載臺北市無障礙通行路線平臺的人行道（無障礙通行線），轉成 WGS84、精簡座標後壓縮存到
// public/data/sidewalks.json.gz。網頁改讀這個檔，不必每次開啟都向市府 API 下載約 9.5 MB 未壓縮資料。
// 執行：node scripts/build_sidewalks.mjs
// --provenance-only 不改顯示資料；--input=檔案 使用本機資料，不自動認定官方來源。
// 本機輸入只有與可信的官方擷取 SHA-256 對照一致時，才能聲稱是官方快照。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import proj4 from "proj4";
import { gzipSync } from "fflate";
import { encodeDisplayLines, parseSidewalkProvenance, sourceMetadata } from "../src/official-sidewalk-provenance.mjs";
import { makeReferenceAsset } from "../src/reference-asset.mjs";
import { gzipSync as gzipReference } from "node:zlib";
import {
  OFFICIAL_SIDEWALK_URL,
  OFFICIAL_SIDEWALK_SOURCE,
} from "../src/official-sidewalks.mjs";

const TWD97 = "+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public/data/sidewalks.json.gz");
const sidecar = path.join(root, "data/processed/official-sidewalk-provenance.json.gz");
const inputArg=process.argv.find(arg=>arg.startsWith('--input='));
const expectedHashArg=process.argv.find(arg=>arg.startsWith('--expected-source-sha256='));
const provenanceOnly=process.argv.includes('--provenance-only');

let bytes,capturedAt=null;
if(inputArg)bytes=fs.readFileSync(path.resolve(inputArg.slice('--input='.length)));
else {
  const response = await fetch(OFFICIAL_SIDEWALK_URL, { headers: { "User-Agent": "TownPass-HaoHaoZou-data-sync" } });
  if (!response.ok) throw new Error(`下載失敗：${response.status}`);
  bytes=Buffer.from(await response.arrayBuffer());capturedAt=new Date().toISOString();
}
const sourceSha256=createHash('sha256').update(bytes).digest('hex');
if(expectedHashArg && sourceSha256!==expectedHashArg.slice('--expected-source-sha256='.length).toLowerCase())
  throw Error(`SOURCE_HASH_MISMATCH: ${sourceSha256}`);
const payload=JSON.parse(bytes.toString('utf8'));
const features=parseSidewalkProvenance(payload);
const provenance=sourceMetadata({expectedSource:OFFICIAL_SIDEWALK_URL,sourceSha256,capturedAt,localInput:!!inputArg});
const artifact={schemaVersion:1,...provenance,generatedAt:new Date().toISOString(),crs:'EPSG:3826',coordinateEncoding:'original WKT numeric tokens',sourceRecordCount:payload.data.length,parts:features};
const provenanceGzip=gzipSync(new TextEncoder().encode(JSON.stringify(artifact)),{level:9});
fs.mkdirSync(path.dirname(sidecar),{recursive:true});
const sidecarTemp=sidecar+'.next';
fs.writeFileSync(sidecarTemp,provenanceGzip);
fs.renameSync(sidecarTemp,sidecar);
console.log(`來源紀錄 ${payload.data.length}、線段 ${features.length}，source SHA-256 ${sourceSha256}；獨立來源紀錄 → ${sidecar}`);
if(provenanceOnly) process.exit(0);
if(!provenance.sourceVerified)throw Error('REFERENCE_SOURCE_NOT_VERIFIED');
const referencePath=path.join(root,'public/data/official-sidewalk-reference.json.gz');
const referenceTemp=referencePath+'.next';
const referenceBody=makeReferenceAsset(artifact),referenceJson=Buffer.from(JSON.stringify(referenceBody)),referenceBytes=gzipReference(referenceJson,{level:9,mtime:0});
const referenceManifest=path.join(root,'public/data/official-sidewalk-reference.meta.json'),referenceManifestTemp=referenceManifest+'.next';
fs.writeFileSync(referenceTemp,referenceBytes);
fs.writeFileSync(referenceManifestTemp,JSON.stringify({schemaVersion:1,sourceHash:referenceBody.sourceHash,assetSha256:createHash('sha256').update(referenceBytes).digest('hex'),jsonSha256:createHash('sha256').update(referenceJson).digest('hex'),parts:referenceBody.parts.length},null,2)+'\n');

// 座標四捨五入到 1e-6 度（約 0.1 公尺），每條線存成 [南, 西, 北, 東, 緯, 經, 緯, 經, …]（整數，×1e6）。
const E = 1e6;
const lines = encodeDisplayLines(features, p => proj4(TWD97, "EPSG:4326", p), E);
const body = JSON.stringify({
  source: inputArg ? null : OFFICIAL_SIDEWALK_SOURCE,
  sourceKind: provenance.sourceKind,
  sourceVerified: provenance.sourceVerified,
  sourceSha256,
  provenanceSchemaVersion: 1,
  fetchedAt: new Date().toISOString(),
  scale: E,
  lines,
});
const gz = gzipSync(new TextEncoder().encode(body), { level: 9 });
const outTemp=out+'.next';fs.writeFileSync(outTemp, gz);
fs.renameSync(referenceTemp,referencePath);fs.renameSync(referenceManifestTemp,referenceManifest);fs.renameSync(outTemp,out);
console.log(`人行道 ${lines.length} 條，壓縮後 ${(gz.length / 1024 / 1024).toFixed(2)} MB → ${out}`);
