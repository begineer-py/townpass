// Export accepted OSM pedestrian geometry for offline matching only.
import fs from 'node:fs';import {gunzipSync,gzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import {edgeAllowed,ROUTING_POLICY} from '../src/routing.mjs';
const bytes=fs.readFileSync('public/data/graph.json.gz'),graph=JSON.parse(gunzipSync(bytes)),edges=[];
for(const [id,e] of graph.edges.entries()){
 const w=graph.ways[e[3]];
 if(!w||w.source==='osm-shared-street'||!edgeAllowed(w,{},e[5])||graph.nodes[e[0]][2]||graph.nodes[e[1]][2]||w.gradeSeparatedPedestrian||w.bridge&&w.bridge!=='no'||w.tunnel&&w.tunnel!=='no'||w.layer!=null&&String(w.layer)!=='0'||w.level!=null&&String(w.level)!=='0')continue;
 const line=[graph.nodes[e[0]].slice(0,2),...(e[4]||[]),graph.nodes[e[1]].slice(0,2)];
 edges.push({id,a:e[0],b:e[1],line});
}
const output='data/processed/shadow-osm-edges.json.gz';fs.writeFileSync(output,gzipSync(JSON.stringify({graphSha256:createHash('sha256').update(bytes).digest('hex'),policy:ROUTING_POLICY,edges})));
console.log(JSON.stringify({output,edges:edges.length,graphSha256:createHash('sha256').update(bytes).digest('hex'),scope:'excludes shared and explicit bridge/tunnel/layer conflict; unknown level is not verified ground'}));
