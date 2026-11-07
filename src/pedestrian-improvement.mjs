import {constructionFresh} from './construction.mjs';
import {metres} from './routing.mjs';

const pedestrian=new Set(['footway','path','pedestrian','corridor']);
const xy=p=>[p[1]*100700,p[0]*111195];
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function pointDistance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
function segmentDistance(a,b,c,d){
 const x1=cross(a,b,c),x2=cross(a,b,d),x3=cross(c,d,a),x4=cross(c,d,b);
 if(((x1>0&&x2<0)||(x1<0&&x2>0))&&((x3>0&&x4<0)||(x3<0&&x4>0)))return 0;
 return Math.min(pointDistance(a,c,d),pointDistance(b,c,d),pointDistance(c,a,b),pointDistance(d,a,b));
}
function parallelOverlap(a,b,c,d){
 const x=b[0]-a[0],y=b[1]-a[1],u=d[0]-c[0],v=d[1]-c[1],length=Math.hypot(x,y),other=Math.hypot(u,v);
 if(length<.001||other<.001||Math.abs(x*u+y*v)/(length*other)<.5)return 0;
 const t1=((c[0]-a[0])*x+(c[1]-a[1])*y)/length,t2=((d[0]-a[0])*x+(d[1]-a[1])*y)/length;
 return Math.max(0,Math.min(length,Math.max(t1,t2))-Math.max(0,Math.min(t1,t2)));
}
const originalEdge=(graph,id)=>graph.edges[id]?.[5]?.derivedFrom??id;
function edgeLine(graph,id){const e=graph.edges[id];return [graph.nodes[e[0]],...(e[4]||[]),graph.nodes[e[1]]].map(xy);}
// Keep only the portions of current shared geometry absent from the candidate.
// Source IDs alone are insufficient: projection can retain just part of an edge.
function differenceSegments(graph,from,to,eligible,{deadline,maxComparisons}){
 const retained=new Map(),removed=[];let comparisons=0;
 for(const id of to.edgeIds){const e=graph.edges[id];if(!eligible(graph.ways[e[3]],e))continue;
  const key=originalEdge(graph,id),line=edgeLine(graph,id);if(!retained.has(key))retained.set(key,[]);
  for(let i=1;i<line.length;i++)retained.get(key).push([line[i-1],line[i]]);
 }
 for(const id of from.edgeIds){const e=graph.edges[id];if(!eligible(graph.ways[e[3]],e))continue;
  const existing=retained.get(originalEdge(graph,id))||[],line=edgeLine(graph,id);
  for(let i=1;i<line.length;i++){
   const a=line[i-1],b=line[i],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length<.001)continue;
   const ranges=[];
   for(const [c,d] of existing){
    if(++comparisons>maxComparisons||((comparisons&255)===0&&Date.now()>deadline))return {segments:[],comparisons,limited:true};
    // Only matching collinear pieces cover this source segment; other pieces
    // may belong to a different bend of the same source geometry.
    const sideC=Math.abs(cross(a,b,c))/length,sideD=Math.abs(cross(a,b,d))/length;
    if(sideC>.02||sideD>.02)continue;
    const t1=((c[0]-a[0])*dx+(c[1]-a[1])*dy)/length,t2=((d[0]-a[0])*dx+(d[1]-a[1])*dy)/length;
    const lo=Math.max(0,Math.min(t1,t2)),hi=Math.min(length,Math.max(t1,t2));if(hi>lo)ranges.push([lo,hi]);
   }
   ranges.sort((x,y)=>x[0]-y[0]);let cursor=0;
   for(const [lo,hi] of ranges){if(lo>cursor+.02)removed.push([[a[0]+dx*cursor/length,a[1]+dy*cursor/length],[a[0]+dx*lo/length,a[1]+dy*lo/length]]);cursor=Math.max(cursor,hi);}
   if(cursor<length-.02)removed.push([[a[0]+dx*cursor/length,a[1]+dy*cursor/length],b]);
  }
 }
 return {segments:removed,comparisons,limited:Date.now()>deadline};
}
function portions(graph,route){
 if(!Array.isArray(route?.edgeIds)||!route.edgeIds.length||route.nodeIds?.length!==route.edgeIds.length+1)return null;
 let total=0,shared=0,footway=0,sidewalk=0;
 for(let i=0;i<route.edgeIds.length;i++){
  const e=graph.edges[route.edgeIds[i]],a=route.nodeIds[i],b=route.nodeIds[i+1];
  if(!e||!((e[0]===a&&e[1]===b)||(e[0]===b&&e[1]===a))||!Number.isFinite(e[2])||e[2]<=0)return null;
  const way=graph.ways[e[3]];total+=e[2];if(way?.source==='osm-shared-street')shared+=e[2];
  else if(way?.highway==='footway'){footway+=e[2];if(way.footway==='sidewalk')sidewalk+=e[2];}
 }
 return {total,shared,footway,sidewalk};
}
function fullDistance(graph,route,start,end,parts){
 return parts.total+metres(start,graph.nodes[route.nodeIds[0]])+metres(end,graph.nodes[route.nodeIds.at(-1)]);
}
export function measurePedestrianRoute(graph,route,start,end){
 const parts=portions(graph,route);return parts?{...parts,distance:fullDistance(graph,route,start,end,parts)}:null;
}
// Search the full segment geometries, not just vertices. This only identifies
// nearby existing edges; graph connectivity is checked by the normal router.
export function hasNewPedestrianNearShared(graph,current,candidate,{radius=50,deadline=Infinity,maxComparisons=100000}={}){
 if(Date.now()>deadline)return {near:false,limited:true};
 const sharedEdge=w=>w?.source==='osm-shared-street';
 const pedestrianEdge=(w,e)=>pedestrian.has(w?.highway)&&w.source!=='osm-shared-street'&&!w.isConnector&&!w.crossing&&(e[5]?.crossingCoverage??0)===0&&!w.gradeSeparatedPedestrian&&(!w.bridge||w.bridge==='no')&&(!w.tunnel||w.tunnel==='no')&&(w.layer==null||String(w.layer)==='0')&&(w.level==null||String(w.level)==='0');
 const removed=differenceSegments(graph,current,candidate,sharedEdge,{deadline,maxComparisons});
 if(removed.limited)return {near:false,limited:true};
 const shared=removed.segments;
 if(!shared.length)return {near:false};
 const added=differenceSegments(graph,candidate,current,pedestrianEdge,{deadline,maxComparisons:maxComparisons-removed.comparisons});
 if(added.limited)return {near:false,limited:true};
 let comparisons=removed.comparisons+added.comparisons;
 for(const [c,d] of added.segments){
  for(const [a,b] of shared){
   if(++comparisons>maxComparisons||((comparisons&255)===0&&Date.now()>deadline))return {near:false,limited:true};
   if(Math.max(a[0],b[0])+radius<Math.min(c[0],d[0])||Math.max(c[0],d[0])+radius<Math.min(a[0],b[0])||Math.max(a[1],b[1])+radius<Math.min(c[1],d[1])||Math.max(c[1],d[1])+radius<Math.min(a[1],b[1]))continue;
   if(parallelOverlap(a,b,c,d)>=5&&segmentDistance(a,b,c,d)<=radius)return Date.now()>deadline?{near:false,limited:true}:{near:true};
  }
 }
 return Date.now()>deadline?{near:false,limited:true}:{near:false};
}

export function improvePedestrianRoute(base,start,end,options,snapshot,{graph,router,verifyLocal,checker},config={}){
 const maxIterations=config.maxIterations??3,totalMs=config.totalMs??4000,maxVisited=config.maxVisited??40000;
 const penalties=config.penalties??[2,6,12],pathPenalties=config.pathPenalties??[0,1.5],radius=50,minimumReduction=1;
 if(!constructionFresh(snapshot))return {error:'CONSTRUCTION_UNAVAILABLE'};
 if(base?.error)return base;
 if(base.provider==='taipei-official')return {...base,pedestrianImprovement:{status:'unsupported-official-provenance',iterations:[]}};
 if(!base.edgeIds)return {...base,pedestrianImprovement:{status:'missing-local-provenance',iterations:[]}};
 const original=portions(graph,base);
 if(!original)return {...base,pedestrianImprovement:{status:'missing-local-provenance',iterations:[]}};
 const originalDistance=fullDistance(graph,base,start,end,original),parent=config.parentBaselineDistance,other=config.otherLegDistance;
 const maxDistance=Number.isFinite(parent)&&parent>0&&Number.isFinite(other)&&other>=0
  ?Math.min(parent*1.3,parent+300)-other:Math.min(originalDistance*1.3,originalDistance+300);
 const deadline=Date.now()+totalMs,iterations=[];
 let current=base,currentParts=original,status=original.shared<minimumReduction?'no-shared-segments':'no-improvement';
 for(let round=0;round<maxIterations&&currentParts.shared>=minimumReduction;round++){
  if(Date.now()>deadline){status='time-limit';break;}
  let best=null,sawLimited=false,timedOut=false;const reasons=[],attempts=[];
  const reject=(attempt,reason)=>{attempt.reason=reason;reasons.push(reason);};
  for(const penalty of penalties)for(const pathPenalty of pathPenalties){
   if(Date.now()>deadline){timedOut=true;break;}
   const attempt={penalty,pathPenalty};attempts.push(attempt);
   const candidate=router(start,end,{...options,lineAllowed:checker.allowed,_optimizeSharedPenalty:penalty,_optimizePathPenalty:pathPenalty,_optimizeDeadline:deadline,_optimizeMaxVisited:maxVisited});
   if(Date.now()>deadline){attempt.reason='time-limit';timedOut=true;break;}
   if(candidate.error){reject(attempt,candidate.error==='OPTIMIZATION_BUDGET'?'search-limit':candidate.error);if(candidate.error==='OPTIMIZATION_BUDGET')sawLimited=true;continue;}
   const parts=portions(graph,candidate);if(!parts){reject(attempt,'invalid-provenance');continue;}
   const distance=fullDistance(graph,candidate,start,end,parts);
   Object.assign(attempt,{distanceMetres:distance,sharedMetres:parts.shared,footwayMetres:parts.footway,explicitSidewalkMetres:parts.sidewalk});
   if(distance>maxDistance+1e-7){reject(attempt,'detour-limit');continue;}
   if(currentParts.shared-parts.shared<minimumReduction){reject(attempt,'insufficient-shared-reduction');continue;}
   const near=hasNewPedestrianNearShared(graph,current,candidate,{radius,deadline,maxComparisons:config.maxComparisons??100000});
   if(Date.now()>deadline){attempt.reason='time-limit';timedOut=true;break;}
   if(!near.near){reject(attempt,near.limited?'proximity-limit':'no-connected-pedestrian-within-50m');if(near.limited)sawLimited=true;continue;}
   const verified=verifyLocal(candidate,start,end,options);if(verified.error){reject(attempt,'verification-failed');continue;}
   if(Date.now()>deadline){attempt.reason='time-limit';timedOut=true;break;}
   const work=checker.inspect(verified.coordinates);if(work.blocked.length){reject(attempt,'construction-blocked');continue;}
   if(Date.now()>deadline){attempt.reason='time-limit';timedOut=true;break;}
   attempt.reason='eligible';
   const value={...verified,provider:base.provider,construction:work,resolvedStart:base.resolvedStart,resolvedEnd:base.resolvedEnd,weightedCost:Object.values(candidate.costBreakdown||{}).reduce((a,b)=>a+b,0)};
   if(!best||parts.shared<best.parts.shared||(parts.shared===best.parts.shared&&(parts.sidewalk>best.parts.sidewalk||(parts.sidewalk===best.parts.sidewalk&&(parts.footway>best.parts.footway||(parts.footway===best.parts.footway&&distance<best.distance))))))best={value,parts,distance,penalty,pathPenalty,attempt};
  }
  if(!constructionFresh(snapshot))return {error:'CONSTRUCTION_UNAVAILABLE'};
  if(timedOut||Date.now()>deadline){iterations.push({round:round+1,result:'time-limit',reasons:[...new Set(reasons)],attempts});status='time-limit';break;}
  if(!best){iterations.push({round:round+1,result:sawLimited?'search-limit':'no-improvement',reasons:[...new Set(reasons)],attempts});status=sawLimited?'search-limit':iterations.length>1?'improved':'no-improvement';break;}
  best.attempt.selected=true;
  iterations.push({round:round+1,result:'improved',previousSharedMetres:currentParts.shared,sharedMetres:best.parts.shared,distanceMetres:best.distance,penalty:best.penalty,pathPenalty:best.pathPenalty,attempts});
  current=best.value;currentParts=best.parts;status=round+1===maxIterations?'iteration-limit':'improved';
 }
 if(!constructionFresh(snapshot))return {error:'CONSTRUCTION_UNAVAILABLE'};
 // A synchronous router cannot be preempted during projection/verification.
 // Never deliver an improvement if the total deadline expired in that work.
 let rolledBack=false;
 if(status==='time-limit'||Date.now()>deadline){status='time-limit';rolledBack=current!==base;current=base;currentParts=original;}
 if(rolledBack)for(const iteration of iterations)if(iteration.result==='improved')iteration.rolledBack=true;
 return {...current,pedestrianImprovement:{status,rolledBack,originalDistanceMetres:originalDistance,maxDistanceMetres:maxDistance,originalSharedMetres:original.shared,sharedMetres:currentParts.shared,originalFootwayMetres:original.footway,footwayMetres:currentParts.footway,originalExplicitSidewalkMetres:original.sidewalk,explicitSidewalkMetres:currentParts.sidewalk,radiusMetres:radius,minimumReductionMetres:minimumReduction,searchLimits:{maxIterations,totalMs,maxVisited,maxComparisons:config.maxComparisons??100000},iterations}};
}
