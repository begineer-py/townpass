import {constructionFresh,workActive} from './construction.mjs';
export const CONSTRUCTION_MARKER_MIN_ZOOM=16;
export const constructionMarkerVisible=zoom=>Number.isFinite(zoom)&&zoom>=CONSTRUCTION_MARKER_MIN_ZOOM;
const validPoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=24.9&&p[0]<=25.3&&p[1]>=121.4&&p[1]<=121.8;
const validGeometry=g=>['Point','LineString','Polygon'].includes(g?.type)&&Array.isArray(g.coordinates)&&g.coordinates.length>=(g.type==='Point'?1:g.type==='LineString'?2:4)&&g.coordinates.every(validPoint);
function pointOf(g,bounds){
 const points=g.coordinates,inside=p=>p[0]>=bounds[0]&&p[0]<=bounds[2]&&p[1]>=bounds[1]&&p[1]<=bounds[3];
 const visible=points.find(inside);if(visible)return visible;
 // Return a point on the real reported geometry, never an artificial snap.
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],dy=b[0]-a[0],dx=b[1]-a[1];let lo=0,hi=1;
  const clip=(p,q)=>{if(p===0)return q>=0;const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);return lo<=hi;};
  if(clip(-dy,a[0]-bounds[0])&&clip(dy,bounds[2]-a[0])&&clip(-dx,a[1]-bounds[1])&&clip(dx,bounds[3]-a[1]))return [a[0]+lo*dy,a[1]+lo*dx];
 }
 if(g.type==='Polygon'){
  const center=[(bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2];let enclosed=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
   const a=points[i],b=points[j];if((a[0]>center[0])!==(b[0]>center[0])&&center[1]<(b[1]-a[1])*(center[0]-a[0])/(b[0]-a[0])+a[1])enclosed=!enclosed;
  }
  if(enclosed)return center;
 }
 return null;
}
export function constructionLabel(work,geometry){
 const kind=work.impact==='blocked'?'施工通報，可能影響通行':work.impact==='clear'?'施工通報，未通報阻斷':'施工通報，影響未明';
 return geometry.type==='Polygon'?`${kind}；顯示通報範圍`:`${kind}；僅顯示通報位置`;
}
// Geometry is retained; viewport filtering is not an assertion of closure.
export function selectVisibleConstruction(snapshot,bounds,now=Date.now(),limit=200,maxGeometries=600,priorityIds=[],priorityOnly=false){
 if(!constructionFresh(snapshot,now))return {status:'stale',items:[],total:0,truncated:false};
 if(!Array.isArray(bounds)||bounds.length!==4||bounds.some(n=>!Number.isFinite(n))||bounds[0]>bounds[2]||bounds[1]>bounds[3]||!Number.isInteger(limit)||limit<1||!Number.isInteger(maxGeometries)||maxGeometries<1)return {status:'invalid',items:[],total:0,truncated:false};
 const center=[(bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2],groupsByKey=new Map(),priority=new Set(Array.isArray(priorityIds)?priorityIds.map(String):[]);
 for(const work of snapshot.works){
  if(priorityOnly&&!priority.has(String(work?.id)))continue;
  if(!work||!workActive({...work,hours:typeof work.hours==='string'?work.hours:''},now)||!Array.isArray(work.geometries))continue;
  const visible=[];
  for(const geometry of work.geometries){
   if(!validGeometry(geometry))continue;
   let south=Infinity,west=Infinity,north=-Infinity,east=-Infinity;
   for(const [lat,lon] of geometry.coordinates){south=Math.min(south,lat);west=Math.min(west,lon);north=Math.max(north,lat);east=Math.max(east,lon);}
   if(north<bounds[0]||south>bounds[2]||east<bounds[1]||west>bounds[3])continue;
   const point=pointOf(geometry,bounds);if(!point)continue;
   const dist=Math.hypot((point[0]-center[0])*111195,(point[1]-center[1])*100700);
   visible.push({geometry,point,dist});
  }
  if(!visible.length)continue;
  // A project often publishes the same geometry in multiple notices; merge
  // matching metadata but keep every source id for route-based priority.
  const project=String(work.id||'').replace(/-\d+$/,'');
  const key=JSON.stringify([project&&project!=='work'?project:work.id,work.address,work.start,work.end,work.hours,work.longTerm,work.impact,work.plan]);
  let group=groupsByKey.get(key);
  if(!group){group={work,geometries:[],point:visible[0].point,anchorGeometry:visible[0].geometry,rank:work.impact==='blocked'?0:work.impact==='clear'?2:1,dist:visible[0].dist,ids:[],count:0,geometryKeys:new Set()};groupsByKey.set(key,group);}
  group.ids.push(String(work.id));group.count++;
  for(const item of visible){
   const shapeKey=JSON.stringify([item.geometry.type,item.geometry.coordinates]);
   if(!group.geometryKeys.has(shapeKey)){group.geometryKeys.add(shapeKey);group.geometries.push(item.geometry);}
   if(item.dist<group.dist){group.point=item.point;group.anchorGeometry=item.geometry;group.dist=item.dist;}
  }
 }
 const groups=[...groupsByKey.values()];
 groups.sort((a,b)=>Number(b.ids.some(id=>priority.has(id)))-Number(a.ids.some(id=>priority.has(id)))||a.rank-b.rank||a.dist-b.dist||String(a.work.id).localeCompare(String(b.work.id)));
 let budget=maxGeometries,truncated=groups.length>limit;const items=[];
 for(const group of groups.slice(0,limit)){
  if(budget<=0){truncated=true;break;}
  if(group.geometries.length>budget)truncated=true;
  const geometries=group.geometries.slice(0,budget);budget-=geometries.length;
  const anchorGeometry=geometries.includes(group.anchorGeometry)?group.anchorGeometry:geometries[0];
  const {geometryKeys,...display}=group;items.push({...display,geometries,anchorGeometry,point:pointOf(anchorGeometry,bounds)});
 }
 return {status:'ready',items,total:groups.length,truncated};
}

// Keep a popup readable when its automatic pan emits moveend. Expiry bypasses
// the pause: old construction must disappear even while its popup is open.
export function createConstructionRedrawGate({redraw,setTimer=setTimeout,clearTimer=clearTimeout,delay=100}){
 let active=true,popup=null,pending=false,timer=null;
 function cancel(){if(timer!==null){clearTimer(timer);timer=null;}}
 function move(){if(!active)return;pending=true;cancel();if(!popup)timer=setTimer(()=>{timer=null;if(!active||popup)return;pending=false;redraw();},delay);}
 function open(value){if(!active||!value)return;if(timer!==null){cancel();pending=true;}popup=value;}
 function close(value){if(!active||!popup||value!==popup)return;popup=null;if(pending){pending=false;cancel();redraw();}}
 function expire(){if(!active)return;cancel();popup=null;pending=false;redraw();}
 function dispose(){active=false;cancel();popup=null;pending=false;}
 return {move,open,close,expire,dispose};
}
