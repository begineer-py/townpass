// Read-only citywide geometric audit. Proximity is not proof of a usable or
// safe connection. Run: node scripts/audit-sidewalk-coverage.mjs
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import proj4 from 'proj4';
import {edgeAllowed} from '../src/routing.mjs';

const root=new URL('../public/data/',import.meta.url);
const read=name=>JSON.parse(gunzipSync(readFileSync(new URL(name+'.json.gz',root))));
const graph=read('graph'),reference=read('official-sidewalk-reference');
const inputSha256=Object.fromEntries(['graph','official-sidewalk-reference'].map(name=>[name,createHash('sha256').update(readFileSync(new URL(name+'.json.gz',root))).digest('hex')]));
const xy=([lat,lon])=>[lon*100700,lat*111195],cell=30,key=(x,y)=>`${x},${y}`;
const routeOptions={identity:'wheelchair',minWidth:.9,maxSlope:1000000,knownOnly:false,avoidSteps:true,officialOnly:false};
const grid=new Map(),segments=[];let skippedLong=0;
function add(a,b,edgeId){
 const x0=Math.floor(Math.min(a[0],b[0])/cell),x1=Math.floor(Math.max(a[0],b[0])/cell),y0=Math.floor(Math.min(a[1],b[1])/cell),y1=Math.floor(Math.max(a[1],b[1])/cell);
 if((x1-x0+1)*(y1-y0+1)>1024){skippedLong++;return;}
 const id=segments.length;segments.push({a,b,edgeId});
 for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const k=key(x,y);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(id);}
}
const parent=new Int32Array(graph.nodes.length);for(let i=0;i<parent.length;i++)parent[i]=i;
function find(a){while(parent[a]!==a){parent[a]=parent[parent[a]];a=parent[a];}return a;}
function union(a,b){a=find(a);b=find(b);if(a!==b)parent[b]=a;}
const walking=new Set(['footway','path','pedestrian','corridor']);let nonshared=0,shared=0;
for(const [id,e] of graph.edges.entries()){
 const w=graph.ways[e[3]],proof=e[5];if(!w||!edgeAllowed(w,routeOptions,proof))continue;
 union(e[0],e[1]);
 if(w.source==='osm-shared-street'){shared++;continue;}
 if(!walking.has(w.highway)||w.crossing===true||w.footway==='crossing'||proof?.gradeSeparatedPedestrian)continue;
 nonshared++;
 const line=[graph.nodes[e[0]],...(e[4]||[]),graph.nodes[e[1]]];
 for(let j=1;j<line.length;j++)add(xy(line[j-1]),xy(line[j]),id);
}
function nearest(p,radius,direction=null,indexGrid=grid,indexSegments=segments){
 const seen=new Set();let best=null;const minX=Math.floor((p[0]-radius)/cell),maxX=Math.floor((p[0]+radius)/cell),minY=Math.floor((p[1]-radius)/cell),maxY=Math.floor((p[1]+radius)/cell);
 for(let x=minX;x<=maxX;x++)for(let y=minY;y<=maxY;y++)for(const i of indexGrid.get(key(x,y))||[]){
  if(seen.has(i))continue;seen.add(i);const s=indexSegments[i],dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1],L=Math.hypot(dx,dy);if(!L)continue;
  if(direction&&Math.abs((dx*direction[0]+dy*direction[1])/L)<.8)continue;
  const t=Math.max(0,Math.min(1,((p[0]-s.a[0])*dx+(p[1]-s.a[1])*dy)/(L*L))),dist=Math.hypot(p[0]-s.a[0]-t*dx,p[1]-s.a[1]-t*dy);
  if(dist<=radius&&(!best||dist<best.dist))best={dist,edgeId:s.edgeId};
 }
 return best;
}
function bucket(){return {sharedEdges:0,sharedMetres:0,near3:0,near10:0,near20:0,sameComponent20:0,samples:[]};}
const city=bucket(),local=bucket(),candidateByEdge=new Map();
for(const [id,e] of graph.edges.entries()){
 const w=graph.ways[e[3]];if(w?.source!=='osm-shared-street'||!edgeAllowed(w,routeOptions,e[5]))continue;
 const points=[graph.nodes[e[0]],...(e[4]||[]),graph.nodes[e[1]]],coords=points.map(xy),lengths=coords.slice(1).map((p,i)=>Math.hypot(p[0]-coords[i][0],p[1]-coords[i][1])),half=lengths.reduce((a,b)=>a+b,0)/2;
 let rest=half,j=0;while(j<lengths.length-1&&rest>lengths[j])rest-=lengths[j++];const a=coords[j],b=coords[j+1],len=lengths[j];if(!len)continue;
 const t=rest/len,p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],direction=[(b[0]-a[0])/len,(b[1]-a[1])/len],lat=p[1]/111195,lon=p[0]/100700,hit=nearest(p,20,direction);
 if(hit){const other=graph.edges[hit.edgeId];candidateByEdge.set(id,{edgeId:id,road:w.name||'',lat:Number(lat.toFixed(6)),lon:Number(lon.toFixed(6)),edgeMetres:Number(e[2].toFixed(1)),osm:{edgeId:hit.edgeId,distanceMetres:Number(hit.dist.toFixed(1)),sameComponent:find(e[0])===find(other[0])}});}
 for(const out of [city,...(lat>=25.105&&lat<=25.114&&lon>=121.525&&lon<=121.538?[local]:[])]){
  out.sharedEdges++;out.sharedMetres+=e[2]||0;
  if(hit){if(hit.dist<=3)out.near3++;if(hit.dist<=10)out.near10++;out.near20++;
   const other=graph.edges[hit.edgeId],same=find(e[0])===find(other[0]);if(same)out.sameComponent20++;
   if(out===local&&out.samples.length<20)out.samples.push({edgeId:id,road:w.name||'',lat:Number(lat.toFixed(6)),lon:Number(lon.toFixed(6)),edgeMetres:Number(e[2].toFixed(1)),nearestMetres:Number(hit.dist.toFixed(1)),parallelEdgeId:hit.edgeId,parallelName:graph.ways[other[3]]?.name||'',sameComponent:same});
  }
 }
}
// Count source parts with at least one vertex geometrically within 2m of an
// OSM pedestrian edge. This does not run the connector safety checks and does
// not include source-to-source joins, so it is not a measure of routability.
const TWD='+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs';
let nearOsm=0,localParts=0,localNear=0,nearOtherSource=0,nearNeither=0;const sourceParts=[],endpoints=new Map();
for(const part of reference.parts){let near=false,inArea=false;const vertices=[];for(const p of part.coordinates){const [lon,lat]=proj4(TWD,'EPSG:4326',p);if(lat>=25.105&&lat<=25.114&&lon>=121.525&&lon<=121.538)inArea=true;const pos=xy([lat,lon]);vertices.push(pos);if(!near&&nearest(pos,2))near=true;}
 if(near)nearOsm++;if(inArea){localParts++;if(near)localNear++;}const id=sourceParts.length;sourceParts.push({vertices,near});
 for(const pos of [vertices[0],vertices.at(-1)]){const k=key(Math.floor(pos[0]/cell),Math.floor(pos[1]/cell));if(!endpoints.has(k))endpoints.set(k,[]);endpoints.get(k).push({id,pos});}
}
for(const [id,part] of sourceParts.entries()){
 let found=false;
 for(const pos of part.vertices){const x0=Math.floor((pos[0]-2)/cell),x1=Math.floor((pos[0]+2)/cell),y0=Math.floor((pos[1]-2)/cell),y1=Math.floor((pos[1]+2)/cell);
  for(let x=x0;x<=x1&&!found;x++)for(let y=y0;y<=y1&&!found;y++)for(const other of endpoints.get(key(x,y))||[])if(other.id!==id&&Math.hypot(pos[0]-other.pos[0],pos[1]-other.pos[1])<=2){found=true;break;}
  if(found)break;
 }
 if(found)nearOtherSource++;if(!found&&!part.near)nearNeither++;
}
const sourceGrid=new Map(),sourceSegments=[];
for(const [id,part] of sourceParts.entries())for(let j=1;j<part.vertices.length;j++){
 const a=part.vertices[j-1],b=part.vertices[j],x0=Math.floor(Math.min(a[0],b[0])/cell),x1=Math.floor(Math.max(a[0],b[0])/cell),y0=Math.floor(Math.min(a[1],b[1])/cell),y1=Math.floor(Math.max(a[1],b[1])/cell);
 if((x1-x0+1)*(y1-y0+1)>1024)continue;
 const i=sourceSegments.length;sourceSegments.push({a,b,edgeId:id});for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){const k=key(x,y);if(!sourceGrid.has(k))sourceGrid.set(k,[]);sourceGrid.get(k).push(i);}
}
for(const out of [city,local]){out.nearOfficial10=0;out.nearOfficial20=0;out.officialSamples=[];}
for(const [id,e] of graph.edges.entries()){
 const w=graph.ways[e[3]];if(w?.source!=='osm-shared-street'||!edgeAllowed(w,routeOptions,e[5]))continue;
 const points=[graph.nodes[e[0]],...(e[4]||[]),graph.nodes[e[1]]].map(xy),lengths=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1]));let rest=lengths.reduce((a,b)=>a+b,0)/2,j=0;
 while(j<lengths.length-1&&rest>lengths[j])rest-=lengths[j++];const a=points[j],b=points[j+1],len=lengths[j];if(!len)continue;
 const t=rest/len,p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],direction=[(b[0]-a[0])/len,(b[1]-a[1])/len],lat=p[1]/111195,lon=p[0]/100700,hit=nearest(p,20,direction,sourceGrid,sourceSegments);if(!hit)continue;
 const part=reference.parts[hit.edgeId],existing=candidateByEdge.get(id)||{edgeId:id,road:w.name||'',lat:Number(lat.toFixed(6)),lon:Number(lon.toFixed(6)),edgeMetres:Number(e[2].toFixed(1))};
 existing.official={qgsFid:part.qgsFid,partIndex:part.partIndex,distanceMetres:Number(hit.dist.toFixed(1))};candidateByEdge.set(id,existing);
 for(const out of [city,...(lat>=25.105&&lat<=25.114&&lon>=121.525&&lon<=121.538?[local]:[])]){
  out.nearOfficial20++;if(hit.dist<=10)out.nearOfficial10++;
  if(out===local&&out.officialSamples.length<30)out.officialSamples.push({edgeId:id,road:w.name||'',lat:Number(lat.toFixed(6)),lon:Number(lon.toFixed(6)),edgeMetres:Number(e[2].toFixed(1)),nearestMetres:Number(hit.dist.toFixed(1)),qgsFid:part.qgsFid,partIndex:part.partIndex});
 }
}
const result={method:'Geometric midpoint nearest parallel OSM pedestrian edge, +/- 20m and absolute direction cosine >= 0.8. Graph edges filtered by wheelchair route options; source vertices within 2m of OSM pedestrian edges or other source-part endpoints. No additional road-crossing, construction, barrier or elevation checks for proposed links; same-component is global graph connectivity only.',routeOptions,generatedAt:new Date().toISOString(),inputSha256,graph:{edges:graph.edges.length,sharedEdges:shared,nonsharedPedestrianEdges:nonshared,indexedSegments:segments.length,skippedLong},city,local:{bounds:[25.105,121.525,25.114,121.538],...local},officialReference:{parts:reference.parts.length,partsWithVertexWithin2mOfOsmPedestrian:nearOsm,partsWithVertexWithin2mOfOtherPartEndpoint:nearOtherSource,partsWithNeitherNearby:nearNeither,localParts,localPartsWithin2m:localNear},candidates:{file:'sidewalk-coverage-candidates-20261108.json.gz',count:candidateByEdge.size}};
writeFileSync(new URL('../reports/'+result.candidates.file,import.meta.url),gzipSync(JSON.stringify({method:result.method,routeOptions,inputSha256,candidates:[...candidateByEdge.values()]},null,0),{level:9,mtime:0}));
writeFileSync(new URL('../reports/sidewalk-coverage-audit-20261108.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
