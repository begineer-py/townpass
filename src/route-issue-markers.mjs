import {ROUTING_POLICY,metres} from './routing.mjs';
import {distanceToRoute} from './live-follow.mjs';
import {officialConditionClass} from './official-conditions.mjs';

const types=Object.freeze({missing_noCurbSlope:'淨寬不足',missing_crosswalkNoRamp:'行穿線未設路緣斜坡'});
const validPoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=24.9&&p[0]<=25.3&&p[1]>=121.4&&p[1]<=121.8;
const allowedRoute=route=>route?.navigationAllowed!==false&&route?.policyVersion===ROUTING_POLICY&&(route.geometryVerification==='pedestrian-network-v1'||route.geometryVerification==='official-polygons-and-crossings-v1'||(route.kind==='official-passageway'&&route.verification==='official-source-screened-v1'&&route.navigationAllowed===true));
const xy=p=>[p[1]*100700,p[0]*111195];
const pointDistance=(p,a,b)=>{const [x,y]=xy(p),[ax,ay]=xy(a),[bx,by]=xy(b),dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(x-ax-t*dx,y-ay-t*dy);};
const interpolate=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];

// The points are observations near the selected, independently verified line.
// Neither the observation nor the highlight certifies a blockage on this side.
// Returning text strings allows the UI to insert them via textContent safely.
export function routeIssueMarkers(route,{radiusMetres=10,highlightStepMetres=10}={}){
 const empty={markers:[],highlights:[]};
 if(!allowedRoute(route)||route?.officialConditions?.status!=='available'||!Array.isArray(route.officialConditions.points)||!Array.isArray(route.coordinates)||route.coordinates.length<2||!route.coordinates.every(validPoint)||!Number.isFinite(radiusMetres)||radiusMetres<0||radiusMetres>10||!Number.isFinite(highlightStepMetres)||highlightStepMetres<=0||highlightStepMetres>20)return empty;
 const groups=new Map(),seen=new Set();
 for(const item of route.officialConditions.points){
  if(!item||!types[item.type]||typeof item.id!=='string'||!item.id||!Number.isFinite(item.lat)||!Number.isFinite(item.lon)||!validPoint([item.lat,item.lon]))continue;
  const id=`${item.type}:${item.id}`;if(seen.has(id))continue;seen.add(id);
  const distance=distanceToRoute([item.lat,item.lon],route.coordinates);if(!Number.isFinite(distance)||distance>radiusMetres+1e-6)continue;
  const key=`${item.lat},${item.lon}`;if(!groups.has(key))groups.set(key,{lat:item.lat,lon:item.lon,records:[],distanceMetres:distance});
  const group=groups.get(key);group.records.push({type:item.type,id:item.id,activity:officialConditionClass(item)});group.distanceMetres=Math.min(group.distanceMetres,distance);
 }
 const markers=[...groups.values()].map(group=>{
  const labels=[...new Set(group.records.map(record=>types[record.type]))];
  const activity=[...new Set(group.records.filter(record=>record.type==='missing_noCurbSlope').map(record=>({high:'高',medium:'中',low:'低',unknown:'未提供'})[record.activity]))];
  const title=group.records.length>1?`附近通行紀錄 ${group.records.length} 筆`:`附近紀錄：${labels[0]}`;
  const detail=`${labels.join('、')}；距路線約 ${Math.round(group.distanceMetres)} 公尺${activity.length?`；活動區域分類：${activity.join('、')}`:''}。與路線的實際關係未確認。`;
  return {...group,title,detail};
 });
 if(!markers.length)return empty;
 // Spatial grid avoids comparing every route fragment with every record.
 const cell=50,grid=new Map(),key=(x,y)=>`${x},${y}`;
 for(const marker of markers){const [x,y]=xy([marker.lat,marker.lon]),k=key(Math.floor(x/cell),Math.floor(y/cell));if(!grid.has(k))grid.set(k,[]);grid.get(k).push([marker.lat,marker.lon]);}
 const highlights=[];
 for(let i=1;i<route.coordinates.length;i++){
  const a=route.coordinates[i-1],b=route.coordinates[i],distance=metres(a,b),count=Math.max(1,Math.ceil(distance/highlightStepMetres));
  for(let j=0;j<count;j++){
   const from=interpolate(a,b,j/count),to=interpolate(a,b,(j+1)/count),[ax,ay]=xy(from),[bx,by]=xy(to);
   const x0=Math.floor((Math.min(ax,bx)-radiusMetres)/cell),x1=Math.floor((Math.max(ax,bx)+radiusMetres)/cell),y0=Math.floor((Math.min(ay,by)-radiusMetres)/cell),y1=Math.floor((Math.max(ay,by)+radiusMetres)/cell);
   let near=false;for(let x=x0;x<=x1&&!near;x++)for(let y=y0;y<=y1&&!near;y++)for(const p of grid.get(key(x,y))||[])if(pointDistance(p,from,to)<=radiusMetres+1e-6){near=true;break;}
   if(near){const previous=highlights.at(-1);if(previous&&metres(previous.coordinates.at(-1),from)<.000001)previous.coordinates.push(to);else highlights.push({coordinates:[from,to],label:'附近有通行問題紀錄，與路線的實際關係未確認。'});}
  }
 }
 return {markers,highlights};
}
