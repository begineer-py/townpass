import proj4 from 'proj4';
const TWD97='+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs';
const valid=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=24.9&&p[0]<=25.3&&p[1]>=121.4&&p[1]<=121.8;
const overlaps=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];

// A bounded search is not proof of no citywide route. Include complete lines
// and edges when any part of their bounding box intersects the region.
export function selectReferenceRegion(asset,graph,start,end,marginMetres=1000){
 if(asset?.schemaVersion!==1||asset.crs!=='EPSG:3826'||asset.source!=='official-passageway'||!/^[a-f0-9]{64}$/i.test(asset.sourceHash||'')||!Array.isArray(asset.parts)||!valid(start)||!valid(end)||!Number.isFinite(marginMetres)||marginMetres<0||marginMetres>3000)throw Error('INVALID_REFERENCE_INPUT');
 const [a,b]=[start,end].map(p=>proj4('EPSG:4326',TWD97,[p[1],p[0]]));
 const bounds=[Math.min(a[0],b[0])-marginMetres,Math.min(a[1],b[1])-marginMetres,Math.max(a[0],b[0])+marginMetres,Math.max(a[1],b[1])+marginMetres];
 const parts=asset.parts.filter(p=>Array.isArray(p.bounds)&&p.bounds.length===4&&p.bounds.every(Number.isFinite)&&overlaps(p.bounds,bounds));
 const latMargin=marginMetres/110000+.001,lonMargin=marginMetres/100000+.001;
 const wgs=[Math.min(start[1],end[1])-lonMargin,Math.min(start[0],end[0])-latMargin,Math.max(start[1],end[1])+lonMargin,Math.max(start[0],end[0])+latMargin];
 const osmEdgeIds=[];
 for(let id=0;id<graph.edges.length;id++){
  const edge=graph.edges[id],a=graph.nodes[edge[0]],b=graph.nodes[edge[1]];
  if(id>=(graph._routeProjectionState?.baseEdges??Infinity)||edge[5]?.derivedFrom!=null)continue;
  if(!a||!b)continue;
  const points=[a,...(edge[4]||[]),b];if(points.some(p=>!Array.isArray(p)||!Number.isFinite(p[0])||!Number.isFinite(p[1])))continue;
  let west=Infinity,south=Infinity,east=-Infinity,north=-Infinity;
  for(const p of points){west=Math.min(west,p[1]);east=Math.max(east,p[1]);south=Math.min(south,p[0]);north=Math.max(north,p[0]);}
  if(overlaps([west,south,east,north],wgs))osmEdgeIds.push(id);
 }
 return {parts,osmEdgeIds,sourceHash:asset.sourceHash,sourceCapturedAt:asset.sourceCapturedAt,scope:'bounded-area',marginMetres};
}
