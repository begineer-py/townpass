import proj4 from 'proj4';
import {metres,ROUTING_POLICY} from './routing.mjs';
import {constructionFresh,createConstructionChecker} from './construction.mjs';
import {roadConnectorChecker} from './geometry.mjs';
import {officialGeometryEvidence} from './supplemental-evidence.mjs';
const TWD97='+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs';
const valid=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=24.9&&p[0]<=25.3&&p[1]>=121.4&&p[1]<=121.8;
const project=(p,a,b)=>{const dy=(b[0]-a[0])*111195,dx=(b[1]-a[1])*100700,t=Math.max(0,Math.min(1,((p[0]-a[0])*111195*dy+(p[1]-a[1])*100700*dx)/(dy*dy+dx*dx||1)));return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];};
const roadCache=new WeakMap();
const overlaps=(b,x,y,r)=>Array.isArray(b)&&b.length===4&&b.every(Number.isFinite)&&b[0]<=x+r&&b[2]>=x-r&&b[1]<=y+r&&b[3]>=y-r;

// Map picks are snapped to an existing mapped pedestrian line; the short
// displacement is retained as an unconfirmed estimate, not a proven entrance.
export function snapMapPoint({point,place,side,graph,router,verifyLocal,asset,snapshot,options={},radius=30,maxMs=4000,maxSegments=200000}){
 if(!valid(point)||!['start','end'].includes(side)||!Number.isFinite(radius)||radius<=0||radius>30||!Number.isFinite(maxMs)||maxMs<=0||!Number.isInteger(maxSegments)||maxSegments<1)return {error:'SNAP_INVALID'};
 if(!constructionFresh(snapshot))return {error:'CONSTRUCTION_UNAVAILABLE'};
 if(!graph||!verifyLocal?.endpointAllowed?.(point,place,side)||typeof router?.mapSnapCandidates!=='function')return {error:'SNAP_UNAVAILABLE'};
 const deadline=Date.now()+maxMs,checker=createConstructionChecker(snapshot);
 let roads=roadCache.get(graph);if(!roads){const {crossings}=officialGeometryEvidence(graph),strict=roadConnectorChecker(graph.roadGeometries,crossings);roads={road:strict,sourceRoad:strict.withCrossingTolerance(.25)};roadCache.set(graph,roads);}
 const {road,sourceRoad}=roads;
 const avoid=options.avoidPoints??[];if(!Array.isArray(avoid)||avoid.some(p=>!valid(p))||avoid.length>10000)return {error:'SNAP_INVALID'};
 const avoided=(a,b)=>avoid.some(p=>metres(p,project(p,a,b))<=25);
 const prefs={...options,[side==='start'?'startPlace':'endPlace']:place,_mapSnapDeadline:deadline,lineAllowed:line=>checker.allowed(line)&&line.slice(1).every((p,i)=>!avoided(line[i],p))};
 let candidates;try{if(Date.now()>deadline)return {error:'SNAP_LIMIT'};candidates=router.mapSnapCandidates(point,prefs,side,radius);}catch(error){if(error?.code==='SNAP_LIMIT')return {error:'SNAP_LIMIT'};throw error;}
 const assetValid=asset?.schemaVersion===1&&asset.source==='official-passageway'&&asset.crs==='EPSG:3826'&&/^[a-f0-9]{64}$/i.test(asset.sourceHash||'')&&Array.isArray(asset.parts);
 let visited=0;
 if(assetValid){
  const [x,y]=proj4('EPSG:4326',TWD97,[point[1],point[0]]);
  for(const part of asset.parts){
   if(Date.now()>deadline)return {error:'SNAP_LIMIT'};
   if(!/^\d+$/.test(String(part.qgsFid))||!Number.isInteger(part.partIndex)||part.partIndex<0||!overlaps(part.bounds,x,y,radius+1)||(part.bridge&&part.bridge!=='no')||(part.tunnel&&part.tunnel!=='no')||(part.layer!=null&&String(part.layer)!=='0')||(part.level!=null&&String(part.level)!=='0')||part.blocked===true||!Array.isArray(part.coordinates))continue;
   for(let i=1;i<part.coordinates.length;i++){
    if(++visited>maxSegments||Date.now()>deadline)return {error:'SNAP_LIMIT'};
    const rawA=part.coordinates[i-1],rawB=part.coordinates[i];if(!Array.isArray(rawA)||!Array.isArray(rawB)||rawA.length!==2||rawB.length!==2||!rawA.every(Number.isFinite)||!rawB.every(Number.isFinite))continue;
    const [alon,alat]=proj4(TWD97,'EPSG:4326',rawA),[blon,blat]=proj4(TWD97,'EPSG:4326',rawB),a=[alat,alon],b=[blat,blon];if(!valid(a)||!valid(b)||metres(a,b)<.001||metres(a,b)>1000)continue;
    const target=project(point,a,b),distanceMetres=metres(point,target);if(distanceMetres>radius+1e-7)continue;
    if(!sourceRoad(a,b)||!road(point,target)||!checker.allowed([point,target])||!checker.allowed([a,b])||avoided(point,target)||avoided(a,b)||!verifyLocal.approachAllowed(point,target,place,prefs,side))continue;
    candidates.push({point:target,distanceMetres,source:'official-line',qgsFid:String(part.qgsFid),partIndex:part.partIndex,segmentIndex:i-1});
   }
  }
 }
 if(!constructionFresh(snapshot))return {error:'CONSTRUCTION_UNAVAILABLE'};
 candidates.sort((a,b)=>a.distanceMetres-b.distanceMetres||String(a.source).localeCompare(String(b.source)));
 const best=candidates.find(c=>!avoided(point,c.point));if(!best)return {error:assetValid?'NO_NEARBY_PEDESTRIAN':'SNAP_DATA_UNAVAILABLE'};
 return {...best,original:[...point],distanceMetres:best.distanceMetres,originalAccess:'unconfirmed',coverage:assetValid?'osm-and-official':'osm-only',policyVersion:ROUTING_POLICY,constructionSourceUpdatedAt:snapshot.sourceUpdatedAt};
}
