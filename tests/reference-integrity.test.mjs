import test from 'node:test';import assert from 'node:assert/strict';import {createHash,webcrypto} from 'node:crypto';import {gzipSync} from 'node:zlib';
import {decodeReferenceAsset} from '../src/reference-integrity.mjs';
test('paired manifest detects corrupt, wrong-source and incomplete reference assets',async()=>{
 if(!globalThis.crypto)Object.defineProperty(globalThis,'crypto',{value:webcrypto,configurable:true});
 const asset={schemaVersion:1,source:'official-passageway',sourceHash:'a'.repeat(64),parts:[{}]},plain=new TextEncoder().encode(JSON.stringify(asset)),bytes=new Uint8Array(gzipSync(plain));
 const manifest={schemaVersion:1,sourceHash:asset.sourceHash,parts:1,assetSha256:createHash('sha256').update(bytes).digest('hex'),jsonSha256:createHash('sha256').update(plain).digest('hex')};
 assert.deepEqual(await decodeReferenceAsset(bytes,manifest),asset);
 assert.deepEqual(await decodeReferenceAsset(plain,manifest),asset);
 const damaged=bytes.slice();damaged[damaged.length-1]^=1;
 await assert.rejects(decodeReferenceAsset(damaged,manifest),/REFERENCE_DATA_INTEGRITY/);
 await assert.rejects(decodeReferenceAsset(bytes,{...manifest,sourceHash:'b'.repeat(64)}),/REFERENCE_DATA_INTEGRITY/);
 await assert.rejects(decodeReferenceAsset(bytes,{...manifest,parts:2}),/REFERENCE_DATA_INTEGRITY/);
});
