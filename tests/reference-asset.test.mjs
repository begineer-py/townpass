import test from 'node:test';import assert from 'node:assert/strict';
import {makeReferenceAsset} from '../src/reference-asset.mjs';
test('reference asset preserves source identity, original precision and bounds',()=>{
 const source={schemaVersion:1,crs:'EPSG:3826',sourceKind:'live-api',sourceVerified:true,sourceSha256:'a'.repeat(64),capturedAt:'2026-11-08T00:00:00Z',parts:[{sourceId:'123',partIndex:1,coordinates:[['303000.125','2778000.75'],['303100.5','2778001.25']]}]};
 const asset=makeReferenceAsset(source);
 assert.equal(asset.sourceHash,source.sourceSha256);assert.equal(asset.parts[0].qgsFid,'123');assert.equal(asset.parts[0].partIndex,1);
 assert.deepEqual(asset.parts[0].coordinates,[[303000.125,2778000.75],[303100.5,2778001.25]]);
 assert.deepEqual(asset.parts[0].bounds,[303000.125,2778000.75,303100.5,2778001.25]);
 assert.throws(()=>makeReferenceAsset({...source,sourceVerified:false}),/INVALID_REFERENCE_SOURCE/);
 assert.throws(()=>makeReferenceAsset({...source,parts:[{sourceId:'x',partIndex:0,coordinates:[['0','0'],['1','1']]}]}),/INVALID_REFERENCE_PART/);
});
