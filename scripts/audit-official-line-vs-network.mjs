// Geometric proximity audit only. Nearness is not a route connection or proof
// of safe walking, crossing, access, elevation, or actual sidewalk coverage.
import fs from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {edgeAllowed,ROUTING_POLICY} from '../src/routing.mjs';

const read=n=>fs.readFileSync(`public/data/${n}.json.gz`), hash=b=>createHash('sha256').update(b).digest('hex');
const graphBytes=read('graph'),sidewalkBytes=read('sidewalks');
const graph=JSON.parse(gunzipSync(graphBytes)), official=JSON.parse(gunzipSync(sidewalkBytes)),scale=official.scale||1e6;
const cell=50, spacing=20,xy=p=>[p[1]*100700,p[0]*111195],grid=new Map();
let graphSegments=0,skippedOversizeSegments=0;
for(const edge of graph.edges){
 const way=graph.ways[edge[3]];
 if(way.source==='osm-shared-street'||!edgeAllowed(way,{},edge[5])||graph.nodes[edge[0]][2]||graph.nodes[edge[1]][2])continue;
 const points=[graph.nodes[edge[0]],...(edge[4]||[]),graph.nodes[edge[1]]].map(xy);
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],x0=Math.floor(Math.min(a[0],b[0])/cell),x1=Math.floor(Math.max(a[0],b[0])/cell),y0=Math.floor(Math.min(a[1],b[1])/cell),y1=Math.floor(Math.max(a[1],b[1])/cell);
  if((x1-x0+1)*(y1-y0+1)>10000){skippedOversizeSegments++;continue;}
  const segment=[a,b];graphSegments++;
  for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const key=`${x},${y}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(segment);}
 }
}
function pointDistance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
const limits=[1,3,5,10,20,50,Infinity],names=['0-1m','1-3m','3-5m','5-10m','10-20m','20-50m','over50m'];
const totals=Object.fromEntries(names.map(n=>[n,{samples:0,metres:0}])),details=[],spatialGrid=new Map();let sampleCount=0,totalMetres=0,invalidLines=0,sourceSegments=0;
for(const [index,row] of official.lines.entries()){
 if(!Array.isArray(row)||row.length<8||(row.length-4)%2){invalidLines++;continue;}
 const points=[];for(let i=4;i+1<row.length;i+=2)points.push(xy([row[i]/scale,row[i+1]/scale]));
 if(points.some(p=>!p.every(Number.isFinite))){invalidLines++;continue;}
 const bins=Array(names.length).fill(0);let length=0,samples=0;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],dist=Math.hypot(b[0]-a[0],b[1]-a[1]);sourceSegments++;if(!dist)continue;
  const n=Math.ceil(dist/spacing),weight=dist/n;length+=dist;
  for(let j=0;j<n;j++){
   const t=(j+.5)/n,p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],cx=Math.floor(p[0]/cell),cy=Math.floor(p[1]/cell);let best=Infinity;
   for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const [c,d] of grid.get(`${cx+dx},${cy+dy}`)||[])best=Math.min(best,pointDistance(p,c,d));
   const bucket=limits.findIndex(limit=>best<=limit);bins[bucket]+=weight;totals[names[bucket]].samples++;totals[names[bucket]].metres+=weight;samples++;sampleCount++;
   // Assign each sample to its own 0.01-degree cell, not its line's start.
   const latCell=Math.floor(p[1]/111195*100),lonCell=Math.floor(p[0]/100700*100),key=`${latCell},${lonCell}`;
   if(!spatialGrid.has(key))spatialGrid.set(key,{south:latCell/100,west:lonCell/100,totalMetres:0,over10Metres:0,samples:0,metresByDistance:Array(names.length).fill(0)});
   const cellStats=spatialGrid.get(key);cellStats.totalMetres+=weight;cellStats.metresByDistance[bucket]+=weight;cellStats.samples++;if(bucket>=4)cellStats.over10Metres+=weight;
  }
 }
 totalMetres+=length;details.push({index,latitude:row[4]/scale,longitude:row[5]/scale,lengthMetres:length,samples,metresByDistance:bins});
}
const codePaths=['src/routing.mjs','src/route-tiers.mjs','src/shared-road-policy.mjs','src/geometry.mjs','src/supplemental-evidence.mjs','src/crossing-evidence.mjs','scripts/audit-official-line-vs-network.mjs'];
const output=process.env.AUDIT_OUTPUT||'reports/official-line-network-proximity.json',detailOutput=process.env.AUDIT_DETAIL_OUTPUT||'reports/official-line-network-proximity-details.json.gz';
const detailBytes=gzipSync(JSON.stringify({bucketNames:names,details}));fs.writeFileSync(detailOutput,detailBytes);
const report={createdAt:new Date().toISOString(),method:'All bundled official line geometries; each original segment divided into equal parts no longer than 20 m, using midpoint nearest-distance to accepted non-shared graph geometries within 50 m. Flat Taiwan metre approximation (latitude x 111195, longitude x 100700). Length-weighted proportions, not administrative city coverage or route reachability.',limits:'No network connectivity, sidewalk-side matching, road-crossing, barriers, entrances, elevation, source age, or on-site accessibility verification. Proximity is diagnostic only; never use as route authorization. Results depend on source order and bundled geographic scope.',graphSha256:hash(graphBytes),sidewalkSha256:hash(sidewalkBytes),codeHashes:Object.fromEntries(codePaths.map(path=>[path,hash(fs.readFileSync(path))])),sidewalkFetchedAt:official.fetchedAt,policy:ROUTING_POLICY,spacingMetres:spacing,nearestSearchLimitMetres:50,sourceLines:official.lines.length,sourceSegments,invalidLines,graphSegments,skippedOversizeSegments,sampleCount,totalMetres,bucketNames:names,totals,gridCellDegrees:.01,grid:[...spatialGrid.values()].sort((a,b)=>a.south-b.south||a.west-b.west),detailOutput,detailSha256:hash(detailBytes)};
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,grid:undefined,gridCells:report.grid.length,output}));
