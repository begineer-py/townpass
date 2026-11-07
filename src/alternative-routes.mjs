import {metres} from './routing.mjs';
import {pointError} from './route-request.mjs';
export function createDetourWaypoints(graph){
 const points=[...new Set(graph.edges.flatMap(e=>[e[0],e[1]]))].map(i=>graph.nodes[i].slice(0,2)).filter(p=>!pointError(p));
 return (start,end,center=start.map((x,i)=>(x+end[i])/2))=>{
  const chosen=[],bins=new Map();
  for(const p of points){
   const d=metres(p,center);if(d<40||d>700||metres(p,start)<20||metres(p,end)<20)continue;
   const angle=Math.atan2(p[0]-center[0],(p[1]-center[1])*.906),bin=Math.floor((angle+Math.PI)/(Math.PI/4))%8;
   const score=Math.abs(d-220);
   if(!bins.has(bin)||score<bins.get(bin).score)bins.set(bin,{p,score});
  }
  for(const {p} of [...bins.values()].sort((a,b)=>a.score-b.score)){if(chosen.every(x=>metres(x,p)>40))chosen.push(p);}
  return chosen;
 };
}
export async function searchVerifiedAlternatives({start,end,waypoints,query,verify,signal,onProgress=()=>{}}){
 let attempts=0;const tried=new Set();
 for(const via of waypoints.slice(0,8)){
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  if(pointError(via))continue;
  const key=via.join(',');if(tried.has(key))continue;tried.add(key);
  onProgress(++attempts);
  const candidate=await query(start,end,via,signal);
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  if(candidate.error)continue;
  const checked=await verify(candidate);
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  if(!checked.error)return {route:checked,attempts};
  if(checked.error==='CONSTRUCTION_UNAVAILABLE')return {error:checked.error,attempts};
 }
 return {error:'NO_VERIFIED_ALTERNATIVE',attempts};
}
