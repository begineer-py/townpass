import {readFile} from 'node:fs/promises';
import {gunzip} from 'node:zlib';
import {promisify} from 'node:util';
import {join} from 'node:path';

const assets=new Set(['graph.json.gz','facilities.json.gz','places.json.gz','official-conditions.json.gz','official-sidewalk-reference.json.gz','official-sidewalk-reference.meta.json']);
const decompress=promisify(gunzip);
export async function readRoutingAsset(input,root=process.cwd()){
 const url=new URL(String(input)),name=url.pathname.split('/').at(-1);
 if(url.origin!=='http://route-data.internal'||!assets.has(name))throw Error('ROUTING_ASSET_INVALID');
 const bytes=await readFile(join(root,'public','data',name));
 return bytes[0]===31&&bytes[1]===139?decompress(bytes):bytes;
}
