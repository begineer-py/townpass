// Coordinate matches are candidate topology only; they do not prove node IDs,
// pedestrian access, layer, crossings, barriers, or route connectivity.
import fs from 'node:fs';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import proj4 from 'proj4';
import {encodeDisplayLines} from '../src/official-sidewalk-provenance.mjs';
import {endpointKey,groupOriginalEndpoints} from './sidewalk-endpoint-audit-lib.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const provenancePath='data/processed/official-sidewalk-provenance.json.gz',displayPath='public/data/sidewalks.json.gz';
const provenanceBytes=fs.readFileSync(provenancePath),displayBytes=fs.readFileSync(displayPath),provenance=JSON.parse(gunzipSync(provenanceBytes)),display=JSON.parse(gunzipSync(displayBytes));
const crs='+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs';
const projected=encodeDisplayLines(provenance.parts,p=>proj4(crs,'EPSG:4326',p),display.scale);
if(projected.length!==display.lines.length||projected.some((row,i)=>JSON.stringify(row)!==JSON.stringify(display.lines[i])))throw Error('DISPLAY_PROVENANCE_GEOMETRY_MISMATCH');
const groups=groupOriginalEndpoints(provenance.parts),shared=[...groups.values()].filter(g=>new Set(g.map(p=>p.lineIndex)).size>=2);
const affected=new Set(shared.flatMap(group=>group.map(p=>p.lineIndex)));
const selfClosure=[...groups.values()].filter(g=>g.length>1&&new Set(g.map(p=>p.lineIndex)).size===1);
const quantized=new Map();
for(const [lineIndex,row] of display.lines.entries())for(const [end,pair] of [['start',[row[4],row[5]]],['end',[row.at(-2),row.at(-1)]]]){
 const key=pair.join(',');if(!quantized.has(key))quantized.set(key,[]);
 const original=provenance.parts[lineIndex].coordinates;quantized.get(key).push({lineIndex,original:endpointKey(end==='start'?original[0]:original.at(-1))});
}
const roundedOnly=[...quantized.values()].filter(group=>new Set(group.map(p=>p.lineIndex)).size>=2&&new Set(group.map(p=>p.original)).size>1);
const summary={createdAt:new Date().toISOString(),method:'Exact decimal value equality on original TWD97 endpoint coordinate tokens; projected display line matching verified for every row. A group requires at least two distinct line parts. No snapping.',limitations:'Exact coordinate agreement is geometric only; original data has no node identity or verified layer and access. Display geometry equality cannot distinguish source identity when two records have identical geometry. Group counts are source-data topology candidates, not routes or confirmed safety.',sourceSha256:provenance.sourceSha256,sidecarSha256:sha(provenanceBytes),displaySha256:sha(displayBytes),sourceRecords:provenance.sourceRecordCount,lineParts:provenance.parts.length,totalEndpoints:provenance.parts.length*2,distinctEndpointCoordinates:groups.size,exactSharedGroups:shared.length,endpointsInSharedGroups:shared.reduce((n,g)=>n+g.length,0),linePartsWithSharedEndpoint:affected.size,exactSharedLinesFraction:affected.size/provenance.parts.length,selfClosureOnlyGroups:selfClosure.length,roundedDisplayGroupsWithDifferentExactCoordinates:roundedOnly.length,largestExactGroup:Math.max(0,...shared.map(g=>g.length)),duplicateGeometryIdentityCaveat:true};
fs.writeFileSync('reports/official-sidewalk-endpoint-audit.json',JSON.stringify(summary,null,2)+'\n');
// Case indices are an optional local investigation, never written to reports.
const arg=process.argv.find(x=>x.startsWith('--case='));
if(arg){const indices=arg.slice(7).split(',').map(Number);if(indices.some(i=>!Number.isInteger(i)||!provenance.parts[i]))throw Error('INVALID_CASE');
 const lines=indices.map(index=>{const part=provenance.parts[index];return {index,sourceId:part.sourceId,partIndex:part.partIndex,start:part.coordinates[0],end:part.coordinates.at(-1)};});
 const endpoints=new Map();for(const line of lines)for(const end of ['start','end']){const k=endpointKey(line[end]);if(!endpoints.has(k))endpoints.set(k,[]);endpoints.get(k).push({index:line.index,sourceId:line.sourceId,partIndex:line.partIndex,end,coordinate:line[end]});}
 const local={sourceSha256:summary.sourceSha256,sidecarSha256:summary.sidecarSha256,displaySha256:summary.displaySha256,lines,exactCoordinateGroups:[...endpoints.values()].filter(g=>g.length>1),note:summary.limitations};
 fs.writeFileSync('data/processed/official-sidewalk-case-endpoints.json',JSON.stringify(local,null,2)+'\n');
}
console.log(JSON.stringify(summary));
