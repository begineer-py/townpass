import {gunzipSync} from 'fflate';
const shaPattern=/^[a-f0-9]{64}$/i;

// The paired manifest detects accidental corruption and mismatched deployments.
// It does not authenticate a malicious server that can replace both files.
export async function decodeReferenceAsset(bytes,manifest){
 if(!(bytes instanceof Uint8Array)||manifest?.schemaVersion!==1||!shaPattern.test(manifest.assetSha256||'')||!shaPattern.test(manifest.jsonSha256||'')||!shaPattern.test(manifest.sourceHash||'')||!Number.isSafeInteger(manifest.parts)||manifest.parts<1||!globalThis.crypto?.subtle)throw Error('REFERENCE_DATA_INTEGRITY');
 const hash=async data=>[...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',data))].map(x=>x.toString(16).padStart(2,'0')).join('');
 // Servers may mark .json.gz with Content-Encoding:gzip, in which case fetch
 // has already decompressed it. Authenticate whichever bytes were delivered.
 const compressed=bytes[0]===31&&bytes[1]===139;
 if(compressed&&await hash(bytes)!==manifest.assetSha256.toLowerCase())throw Error('REFERENCE_DATA_INTEGRITY');
 let plain;try{plain=compressed?gunzipSync(bytes):bytes;}catch{throw Error('REFERENCE_DATA_INTEGRITY');}
 if(await hash(plain)!==manifest.jsonSha256.toLowerCase())throw Error('REFERENCE_DATA_INTEGRITY');
 let asset;try{asset=JSON.parse(new TextDecoder().decode(plain));}catch{throw Error('REFERENCE_DATA_INTEGRITY');}
 if(asset?.schemaVersion!==1||asset.source!=='official-passageway'||asset.sourceHash!==manifest.sourceHash||!Array.isArray(asset.parts)||asset.parts.length!==manifest.parts)throw Error('REFERENCE_DATA_INTEGRITY');
 return asset;
}
