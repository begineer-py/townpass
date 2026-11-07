import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import proj4 from 'proj4';

// Public map endpoint used by the Taipei platform. The response is a snapshot,
// not a guarantee that all real-world barriers have been surveyed.
const url='https://tppano.gov.taipei/tp_roadsidewalkplatform_be/api/C00/C10/C11_mapStreetView/missing_v2';
const twd97='+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs';
const response=await fetch(url,{signal:AbortSignal.timeout(90000)});
if(!response.ok)throw Error(`Official conditions HTTP ${response.status}`);
const text=await response.text(),raw=JSON.parse(text),types=['missing_noCurbSlope','missing_crosswalkNoRamp'];
if(raw.code!=='101'||!raw.data||types.some(k=>!Array.isArray(raw.data[k])))throw Error('Official conditions invalid response');
const extra=Object.keys(raw.data).filter(k=>!types.includes(k));
if(extra.length)throw Error(`Unknown official categories: ${extra.join(', ')}`);
const ids=new Set(),points=[];
for(const type of types)for(const row of raw.data[type]){
 const id=String(row.qgs_fid??''),match=String(row.STAsText??'').match(/^POINT\s*\(\s*([-+\d.eE]+)\s+([-+\d.eE]+)\s*\)$/i);
 if(!id||!match||ids.has(`${type}:${id}`))throw Error(`Invalid or duplicate record: ${type}/${id}`);
 ids.add(`${type}:${id}`);const xy=match.slice(1).map(Number);if(!xy.every(Number.isFinite))throw Error('Invalid TWD97 point');
 const [lon,lat]=proj4(twd97,'EPSG:4326',xy);
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<24||lat>27||lon<120||lon>123)throw Error('Point outside expected area');
 points.push({id,type,lat,lon,activity:typeof row.type==='string'?row.type:null});
}
const output={schemaVersion:1,source:url,fetchedAt:new Date().toISOString(),sourceObservedAt:null,sourceSha256:createHash('sha256').update(text).digest('hex'),counts:Object.fromEntries(types.map(k=>[k,raw.data[k].length])),points};
const target='public/data/official-conditions.json.gz',temp=target+'.next';
fs.writeFileSync(temp,gzipSync(JSON.stringify(output),{level:9}));fs.renameSync(temp,target);
console.log(JSON.stringify({counts:output.counts,total:points.length,sourceSha256:output.sourceSha256,fetchedAt:output.fetchedAt,output:target}));
