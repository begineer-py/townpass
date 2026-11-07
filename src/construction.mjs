import proj4 from 'proj4';
export const CONSTRUCTION_MAX_AGE = 30 * 60 * 1000;
const twd97='+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs';
const valid=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=24.9&&p[0]<=25.3&&p[1]>=121.4&&p[1]<=121.8;
const project=p=>{if(!Array.isArray(p)||!p.slice(0,2).every(Number.isFinite))return null;const [lon,lat]=proj4(twd97,'EPSG:4326',p.slice(0,2));return valid([lat,lon])?[lat,lon]:null;};
export function normalizeConstruction(payload,sourceUpdatedAt,now=Date.now()) {
 if(payload?.type!=='FeatureCollection'||!Array.isArray(payload.features))throw Error('CONSTRUCTION_INVALID');
 const works=payload.features.map((f,i)=>{
  const p=f.properties||{}, geometries=[];
  function walk(a){
   if(!Array.isArray(a)||!a.length)return;
   if(Array.isArray(a[0])&&typeof a[0][0]==='number'){
    const coordinates=a.map(project);if(coordinates.some(x=>!x))return;
    const closed=coordinates.length>=4&&coordinates[0].every((v,k)=>v===coordinates.at(-1)[k]);
    geometries.push({type:closed?'Polygon':coordinates.length===1?'Point':'LineString',coordinates});
   }else a.forEach(walk);
  }
  let positions=p.Positions;
  if(typeof positions==='string'){try{positions=JSON.parse(positions);}catch{positions=null;}}
  walk(positions);
  if(!geometries.length){const point=project([Number(p.X),Number(p.Y)]);if(point)geometries.push({type:'Point',coordinates:[point]});}
  return {id:String(p.Ac_no||'work')+'-'+String(p.sno??i),address:String(p.Addr||'施工通報位置'),start:String(p.Cb_Da||''),end:String(p.Ce_Da||''),hours:String(p.Co_Ti||''),longTerm:p.IsStay==='是',impact:p.IsBlock==='是'?'blocked':p.IsBlock==='否'?'clear':'unknown',plan:String(p.PlanB||''),geometries};
 });
 return {schemaVersion:1,fetchedAt:new Date(now).toISOString(),sourceUpdatedAt,works};
}
export function constructionFresh(snapshot,now=Date.now()){
 const fetched=Date.parse(snapshot?.fetchedAt),source=Date.parse(snapshot?.sourceUpdatedAt);
 return snapshot?.schemaVersion===1&&Array.isArray(snapshot.works)&&Number.isFinite(fetched)&&Number.isFinite(source)&&fetched<=now+60000&&source<=now+60000&&now-fetched<=CONSTRUCTION_MAX_AGE&&now-source<=CONSTRUCTION_MAX_AGE;
}
const DAY=86400000;
function day(s){const m=String(s).match(/^(\d{2,4})[\/-](\d{1,2})[\/-](\d{1,2})$/);if(!m)return NaN;const y=+m[1]+(+m[1]<1911?1911:0),dt=new Date(Date.UTC(y,+m[2]-1,+m[3]));return dt.getUTCFullYear()===y&&dt.getUTCMonth()===+m[2]-1&&dt.getUTCDate()===+m[3]?+dt:NaN;}
export function workActive(w,now=Date.now()){
 const local=new Date(now+8*3600000),today=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()),start=day(w.start),end=day(w.end);
 if(!Number.isFinite(start)||!Number.isFinite(end)||start>end)return true;
 const clock=local.getUTCHours()*60+local.getUTCMinutes();
 // Only interpret a single unambiguous window; complex prose remains conservatively active.
 const m=w.hours.match(/^(?:自|日間施工|夜間施工)?\s*(\d{1,2})時(?:(\d{1,2})分)?至(\d{1,2})時(?:(\d{1,2})分)?$/);
 if(!w.longTerm&&m){const a=+m[1]*60+(+m[2]||0),b=+m[3]*60+(+m[4]||0);
  if(+m[1]<=23&&+m[3]<=24&&(+m[2]||0)<60&&(+m[4]||0)<60&&b<=1440&&a!==b){
   const workday=a>b&&clock<b?today-DAY:today;
   return workday>=start&&workday<=end&&(a<b?clock>=a&&clock<b:clock>=a||clock<b);
  }
 }
 return today>=start&&today<=end;
}
const xy=p=>[p[1]*100700,p[0]*111195];
function pointDistance(p,a,b){const x=b[0]-a[0],y=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*x+(p[1]-a[1])*y)/(x*x+y*y||1)));return Math.hypot(p[0]-a[0]-t*x,p[1]-a[1]-t*y);}
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function segmentDistance(a,b,c,d){
 const hit=((cross(a,b,c)>0)!==(cross(a,b,d)>0))&&((cross(c,d,a)>0)!==(cross(c,d,b)>0));
 return hit?0:Math.min(pointDistance(a,c,d),pointDistance(b,c,d),pointDistance(c,a,b),pointDistance(d,a,b));
}
function inside(p,ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
export function createConstructionChecker(snapshot,now=Date.now()){
 if(!constructionFresh(snapshot,now))throw Error('CONSTRUCTION_UNAVAILABLE');
 const active=snapshot.works.filter(w=>workActive(w,now));
 const unmapped=active.filter(w=>w.impact!=='clear'&&!w.geometries.length).length;
 const shapes=active.flatMap(w=>w.geometries.map(g=>{
  if(!['Point','LineString','Polygon'].includes(g.type)||!g.coordinates?.length||g.coordinates.some(p=>!valid(p)))throw Error('CONSTRUCTION_INVALID');
  const coords=g.coordinates.map(xy),xs=coords.map(p=>p[0]),ys=coords.map(p=>p[1]);return {w,type:g.type,coords,geometry:{type:g.type,coordinates:g.coordinates},box:[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]};
 }));
 function inspect(line){
  if(!Array.isArray(line)||!line.length||line.some(p=>!valid(p.slice(0,2))))throw Error('CONSTRUCTION_INVALID_ROUTE');
  const points=line.map(xy),hits=new Map();
  for(let i=0;i<Math.max(1,points.length-1);i++){
   const a=points[i],b=points[i+1]||a;
   for(const g of shapes){
    if(Math.max(a[0],b[0])+70<g.box[0]||Math.min(a[0],b[0])-70>g.box[2]||Math.max(a[1],b[1])+70<g.box[1]||Math.min(a[1],b[1])-70>g.box[3])continue;
    let d=g.type==='Polygon'&&(inside(a,g.coords)||inside(b,g.coords))?0:Infinity;
    for(let j=0;j<Math.max(1,g.coords.length-1);j++)d=Math.min(d,segmentDistance(a,b,g.coords[j],g.coords[j+1]||g.coords[j]));
    if(d>70)continue;
    // A point/line is not an exact work-zone boundary: avoid a conservative 10m vicinity, labelled as such.
    const blocked=g.w.impact!=='clear'&&(g.type==='Polygon'?d<0.05:d<=10);
    const old=hits.get(g.w.id);if(!old||blocked&&!old.blocked||(blocked===old.blocked&&d<old.distanceM))hits.set(g.w.id,{id:g.w.id,address:g.w.address,start:g.w.start,end:g.w.end,hours:g.w.hours,longTerm:g.w.longTerm,impact:g.w.impact,plan:g.w.plan,geometry:g.geometry,distanceM:Math.round(d),blocked,match:g.type==='Polygon'?'area':'vicinity'});
   }
  }
  return {blocked:[...hits.values()].filter(w=>w.blocked),nearby:[...hits.values()],unmapped,sourceUpdatedAt:snapshot.sourceUpdatedAt,checkedAt:new Date(now).toISOString()};
 }
 return {inspect,allowed:line=>inspect(line).blocked.length===0};
}
