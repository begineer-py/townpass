// Point locations are map observations, not exact route ownership or current
// passability. A proximity match must always be described as "nearby".
export const OFFICIAL_CONDITION_TYPES=Object.freeze({
 missing_noCurbSlope:'官方記錄：淨寬不足',
 missing_crosswalkNoRamp:'官方記錄：行穿線未設路緣斜坡',
});
// Activity-area classification is not a measurement of barrier severity.
// It is used only as a small, explicit route-ranking preference. Missing or
// unrecognised classes retain a middle weight, never the low-class weight.
export function officialConditionClass(point){
 const match=point?.type==='missing_noCurbSlope' && /^活動區域分類-(高|中|低)$/.exec(String(point.activity||''));
 return match ? ({高:'high',中:'medium',低:'low'})[match[1]] : 'unknown';
}
export function officialConditionWeight(point){
 return ({high:3,medium:2,low:1,unknown:2})[officialConditionClass(point)];
}
export function officialConditionMetrics(conditions){
 if(conditions?.status!=='available'||!Array.isArray(conditions.points))return {officialConditionCount:null,officialConditionWeight:null,officialConditionClasses:null};
 const nearby=conditions.points.filter(p=>Number.isFinite(p.distanceMetres)&&p.distanceMetres<=2);
 const classes={high:0,medium:0,low:0,unknown:0};
 for(const point of nearby)classes[officialConditionClass(point)]++;
 return {officialConditionCount:nearby.length,officialConditionWeight:nearby.reduce((sum,p)=>sum+officialConditionWeight(p),0),officialConditionClasses:classes};
}
// A missing dataset is uncertainty, not a clean route. The fixed uncertainty
// penalty equals one unclassified observation, not an invented count.
export const officialConditionScore = weight => weight===0 ? 0 : -Math.min(20, weight==null ? 2 : weight);
const metresXY=p=>[p[1]*100700,p[0]*111195];
function distance(p,a,b){
 const [x,y]=metresXY(p),[ax,ay]=metresXY(a),[bx,by]=metresXY(b),dx=bx-ax,dy=by-ay;
 const t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1)));
 return Math.hypot(x-ax-t*dx,y-ay-t*dy);
}
export function createOfficialConditionIndex(dataset){
 if(dataset?.schemaVersion!==1||!Array.isArray(dataset.points)||typeof dataset.fetchedAt!=='string')throw Error('INVALID_OFFICIAL_CONDITIONS');
 const grid=new Map(),cell=.00025,seen=new Set(),byId=new Map();
 for(const p of dataset.points){
  if(!p||!OFFICIAL_CONDITION_TYPES[p.type]||typeof p.id!=='string'||!p.id||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||p.lat<24||p.lat>27||p.lon<120||p.lon>123)throw Error('INVALID_OFFICIAL_CONDITION');
  const id=`${p.type}:${p.id}`;if(seen.has(id))throw Error('DUPLICATE_OFFICIAL_CONDITION');seen.add(id);
  byId.set(id,p);
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
 return {find,get:(type,id)=>byId.get(`${type}:${id}`)||null,fetchedAt:dataset.fetchedAt,sourceObservedAt:dataset.sourceObservedAt??null,source:dataset.source};
}
