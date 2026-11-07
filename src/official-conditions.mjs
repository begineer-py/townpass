// Point locations are map observations, not exact route ownership or current
// passability. A proximity match must always be described as "nearby".
export const OFFICIAL_CONDITION_TYPES=Object.freeze({
 missing_noCurbSlope:'官方記錄：淨寬不足',
 missing_crosswalkNoRamp:'官方記錄：行穿線未設路緣斜坡',
});
const metresXY=p=>[p[1]*100700,p[0]*111195];
function distance(p,a,b){
 const [x,y]=metresXY(p),[ax,ay]=metresXY(a),[bx,by]=metresXY(b),dx=bx-ax,dy=by-ay;
 const t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1)));
 return Math.hypot(x-ax-t*dx,y-ay-t*dy);
}
export function createOfficialConditionIndex(dataset){
 if(dataset?.schemaVersion!==1||!Array.isArray(dataset.points)||typeof dataset.fetchedAt!=='string')throw Error('INVALID_OFFICIAL_CONDITIONS');
 const grid=new Map(),cell=.00025,seen=new Set();
 for(const p of dataset.points){
  if(!p||!OFFICIAL_CONDITION_TYPES[p.type]||typeof p.id!=='string'||!p.id||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||p.lat<24||p.lat>27||p.lon<120||p.lon>123)throw Error('INVALID_OFFICIAL_CONDITION');
  const id=`${p.type}:${p.id}`;if(seen.has(id))throw Error('DUPLICATE_OFFICIAL_CONDITION');seen.add(id);
  const key=`${Math.floor(p.lat/cell)},${Math.floor(p.lon/cell)}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(p);
 }
 function find(line,radius=2){
  if(!Array.isArray(line)||line.length<2||line.some(p=>!Array.isArray(p)||!Number.isFinite(p[0])||!Number.isFinite(p[1]))||!Number.isFinite(radius)||radius<0||radius>30)throw Error('INVALID_CONDITION_QUERY');
  const matches=new Map(),latPad=radius/111195,lonPad=radius/100700;
  for(let i=1;i<line.length;i++){
   const a=line[i-1],b=line[i];
   const ymin=Math.floor((Math.min(a[0],b[0])-latPad)/cell),ymax=Math.floor((Math.max(a[0],b[0])+latPad)/cell),xmin=Math.floor((Math.min(a[1],b[1])-lonPad)/cell),xmax=Math.floor((Math.max(a[1],b[1])+lonPad)/cell);
   // Avoid enormous cell walks for unexpectedly long route segments.
   const count=(ymax-ymin+1)*(xmax-xmin+1),candidates=[];
   if(count>10000)candidates.push(...dataset.points);
   else for(let y=ymin;y<=ymax;y++)for(let x=xmin;x<=xmax;x++)candidates.push(...(grid.get(`${y},${x}`)||[]));
   for(const p of candidates){const d=distance([p.lat,p.lon],a,b);if(d>radius)continue;const key=`${p.type}:${p.id}`,previous=matches.get(key);if(!previous||d<previous.distanceMetres)matches.set(key,{...p,distanceMetres:d,label:OFFICIAL_CONDITION_TYPES[p.type]});}
  }
  return [...matches.values()].sort((a,b)=>a.distanceMetres-b.distanceMetres||a.id.localeCompare(b.id));
 }
 return {find,fetchedAt:dataset.fetchedAt,sourceObservedAt:dataset.sourceObservedAt??null,source:dataset.source};
}
