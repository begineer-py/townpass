import {constructionFresh} from './construction.mjs';
import {metres,ROUTING_POLICY} from './routing.mjs';
import {generalSidewalkEdge} from './general-sidewalk.mjs';

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
const sourceProof=(graph,e)=>e?.[5]?.derivedFrom!=null?graph.edges[e[5].derivedFrom]?.[5]:e?.[5];
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
  else {if(way?.highway==='footway')footway+=e[2];if(generalSidewalkEdge(way,sourceProof(graph,e)))sidewalk+=e[2];}
 }
 return {total,shared,footway,sidewalk};
}
function fullDistance(graph,route,start,end,parts){
 return parts.total+metres(start,graph.nodes[route.nodeIds[0]])+metres(end,graph.nodes[route.nodeIds.at(-1)]);
}
export function measurePedestrianRoute(graph,route,start,end){
 const parts=portions(graph,route);return parts?{...parts,distance:fullDistance(graph,route,start,end,parts)}:null;
}
// Measure unconfirmed approaches from geometry, not their rounded UI labels.
// Missing or inconsistent geometry cannot establish a safe comparison.
export function measureUnconfirmedApproaches(graph,route,start,end){
 if(!Array.isArray(route?.approaches)||!Array.isArray(route.nodeIds)||!route.nodeIds.length)return null;
 const first=graph.nodes[route.nodeIds[0]],last=graph.nodes[route.nodeIds.at(-1)];
 if(!first||!last)return null;
 const result={start:{count:0,metres:0},end:{count:0,metres:0}},seen={start:0,end:0};
 const valid=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1]);
 const same=(a,b)=>valid(a)&&valid(b)&&metres(a,b)<=1e-6;
 if(!valid(start)||!valid(end))return null;
 for(const a of route.approaches){
  if(!a||!['start','end'].includes(a.side)||!Array.isArray(a.coordinates)||a.coordinates.length<2||a.coordinates.some(p=>!valid(p)))return null;
  if(a.estimated!==true&&a.estimated!==false&&a.unconfirmed!==true&&a.entryStatus!=='unconfirmed')return null;
  const expectedStart=a.side==='start'?start:last,expectedEnd=a.side==='start'?first:end;
  if(!same(a.coordinates[0],expectedStart)||!same(a.coordinates.at(-1),expectedEnd))return null;
  seen[a.side]++;
  if(a.estimated===true||a.unconfirmed===true||a.entryStatus==='unconfirmed'){
   result[a.side].count++;
   for(let i=1;i<a.coordinates.length;i++)result[a.side].metres+=metres(a.coordinates[i-1],a.coordinates[i]);
  }
 }
 if((metres(start,first)>.05&&!seen.start)||(metres(end,last)>.05&&!seen.end))return null;
 return result;
}
export function compareUnconfirmedApproaches(baseline,candidate){
 for(const side of ['start','end']){
  if(candidate[side].count>baseline[side].count)return 'unconfirmed-approach-added';
  if(candidate[side].metres>baseline[side].metres+1e-6)return 'unconfirmed-approach-lengthened';
 }
 return null;
}
// Search the full segment geometries, not just vertices. This only identifies
// nearby existing edges; graph connectivity is checked by the normal router.
const sharedEdge=w=>w?.source==='osm-shared-street';
const groundPedestrian=(w,e,proof=e[5])=>pedestrian.has(w?.highway)&&w.source!=='osm-shared-street'&&!w.isConnector&&!w.crossing&&w.footway!=='crossing'&&(proof?.crossingCoverage??0)===0&&!w.gradeSeparatedPedestrian&&(!w.bridge||w.bridge==='no')&&(!w.tunnel||w.tunnel==='no')&&(w.layer==null||String(w.layer)==='0')&&(w.level==null||String(w.level)==='0');
const generalSidewalk=(graph,w,e)=>groundPedestrian(w,e,sourceProof(graph,e))&&generalSidewalkEdge(w,sourceProof(graph,e));
function nearReplaced(graph,current,candidate,removedEdge,addedEdge,{radius=50,deadline=Infinity,maxComparisons=100000}={}){
 if(Date.now()>deadline)return {near:false,limited:true};
 const removed=differenceSegments(graph,current,candidate,removedEdge,{deadline,maxComparisons});
 if(removed.limited)return {near:false,limited:true};
 const shared=removed.segments;
 if(!shared.length)return {near:false};
 const added=differenceSegments(graph,candidate,current,addedEdge,{deadline,maxComparisons:maxComparisons-removed.comparisons});
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
export function hasNewPedestrianNearShared(graph,current,candidate,options){return nearReplaced(graph,current,candidate,sharedEdge,(w,e)=>groundPedestrian(w,e,sourceProof(graph,e)),options);}
export function hasNewSidewalkNearReplaced(graph,current,candidate,options){
 return nearReplaced(graph,current,candidate,(w,e)=>sharedEdge(w)||(groundPedestrian(w,e,sourceProof(graph,e))&&!generalSidewalk(graph,w,e)),(w,e)=>generalSidewalk(graph,w,e),options);
}

function improvePedestrianRouteInner(base,start,end,options,snapshot,{graph,router,verifyLocal,checker},config={}){
 const maxIterations=config.maxIterations??3,totalMs=config.totalMs??4000,maxVisited=config.maxVisited??40000;
 const penalties=config.penalties??[0,6,12],sidewalkPenalties=config.sidewalkPenalties??[0,2,6],radius=50,minimumReduction=1;
 if(!constructionFresh(snapshot))return {error:'CONSTRUCTION_UNAVAILABLE'};
 if(base?.error)return base;
 if(base.provider==='taipei-official')return {...base,pedestrianImprovement:{status:'unsupported-official-provenance',iterations:[]}};
 if(!base.edgeIds)return {...base,pedestrianImprovement:{status:'missing-local-provenance',iterations:[]}};
 const original=portions(graph,base);
 if(!original)return {...base,pedestrianImprovement:{status:'missing-local-provenance',iterations:[]}};
 const originalApproaches=measureUnconfirmedApproaches(graph,base,start,end);
 if(!originalApproaches)return {...base,pedestrianImprovement:{status:'missing-approach-evidence',iterations:[]}};
 const originalDistance=fullDistance(graph,base,start,end,original),parent=config.parentBaselineDistance,other=config.otherLegDistance;
 const hasParent=Number.isFinite(parent)&&parent>0&&Number.isFinite(other)&&other>=0;
 const otherSidewalk=hasParent&&Number.isFinite(config.otherLegSidewalkMetres)&&config.otherLegSidewalkMetres>=0?config.otherLegSidewalkMetres:0;
 const maxDistance=hasParent
  ?Math.min(parent*1.3,parent+300)-other:Math.min(originalDistance*1.3,originalDistance+300);
 const deadline=Date.now()+totalMs,iterations=[];
 let current=base,currentParts=original,currentDistance=originalDistance,currentApproaches=originalApproaches,status=original.total-original.sidewalk<5?'no-non-sidewalk-segments':'no-improvement';
 for(let round=0;round<maxIterations&&currentParts.total-currentParts.sidewalk>=5;round++){
  if(Date.now()>deadline){status='time-limit';break;}
  let best=null,sawLimited=false,timedOut=false;const reasons=[],attempts=[];
  const reject=(attempt,reason)=>{attempt.reason=reason;reasons.push(reason);};
  for(const penalty of penalties)for(const sidewalkPenalty of sidewalkPenalties){
   if(Date.now()>deadline){timedOut=true;break;}
   const attempt={penalty,sidewalkPenalty};attempts.push(attempt);
   const candidate=router(start,end,{...options,lineAllowed:checker.allowed,_optimizeSharedPenalty:penalty,_optimizeNonSidewalkPenalty:sidewalkPenalty,_optimizeDeadline:deadline,_optimizeMaxVisited:maxVisited});
   if(Date.now()>deadline){attempt.reason='time-limit';timedOut=true;break;}
   if(candidate.error){reject(attempt,candidate.error==='OPTIMIZATION_BUDGET'?'search-limit':candidate.error);if(candidate.error==='OPTIMIZATION_BUDGET')sawLimited=true;continue;}
   const parts=portions(graph,candidate);if(!parts){reject(attempt,'invalid-provenance');continue;}
   const distance=fullDistance(graph,candidate,start,end,parts);
   const currentShare=(currentParts.sidewalk+otherSidewalk)/(currentDistance+(hasParent?other:0)),candidateShare=(parts.sidewalk+otherSidewalk)/(distance+(hasParent?other:0));
   Object.assign(attempt,{distanceMetres:distance,sharedMetres:parts.shared,footwayMetres:parts.footway,explicitSidewalkMetres:parts.sidewalk,sidewalkShare:candidateShare});
   if(distance>maxDistance+1e-7){reject(attempt,'detour-limit');continue;}
   if(parts.shared>currentParts.shared+1e-7){reject(attempt,'shared-increased');continue;}
   if(candidateShare+1e-12<currentShare){reject(attempt,'sidewalk-share-regression');continue;}
   const sharedBetter=currentParts.shared-parts.shared>=minimumReduction,sidewalkBetter=candidateShare>currentShare+1e-12;
   if(!sharedBetter&&!sidewalkBetter){reject(attempt,'insufficient-improvement');continue;}
   let near=sidewalkBetter?hasNewSidewalkNearReplaced(graph,current,candidate,{radius,deadline,maxComparisons:config.maxComparisons??100000}):{near:false};
   let reason='sidewalk-share-increased';
   if(!near.near&&!near.limited&&sharedBetter){near=hasNewPedestrianNearShared(graph,current,candidate,{radius,deadline,maxComparisons:config.maxComparisons??100000});reason='shared-reduced';}
   if(Date.now()>deadline){attempt.reason='time-limit';timedOut=true;break;}
   if(!near.near){reject(attempt,near.limited?'proximity-limit':'no-connected-pedestrian-within-50m');if(near.limited)sawLimited=true;continue;}
   const verified=verifyLocal(candidate,start,end,options);if(verified.error){reject(attempt,'verification-failed');continue;}
   if(Date.now()>deadline){attempt.reason='time-limit';timedOut=true;break;}
   const candidateApproaches=measureUnconfirmedApproaches(graph,verified,start,end);
   if(!candidateApproaches){reject(attempt,'invalid-approach-evidence');continue;}
   attempt.unconfirmedApproaches=candidateApproaches;
   const approachReason=compareUnconfirmedApproaches(originalApproaches,candidateApproaches)||compareUnconfirmedApproaches(currentApproaches,candidateApproaches);
   if(approachReason){reject(attempt,approachReason);continue;}
   const work=checker.inspect(verified.coordinates);if(work.blocked.length){reject(attempt,'construction-blocked');continue;}
   if(Date.now()>deadline){attempt.reason='time-limit';timedOut=true;break;}
   attempt.reason='eligible';attempt.improvementKind=reason;
   const value={...verified,provider:base.provider,construction:work,resolvedStart:base.resolvedStart,resolvedEnd:base.resolvedEnd,weightedCost:Object.values(candidate.costBreakdown||{}).reduce((a,b)=>a+b,0)};
   if(!best||candidateShare>best.share+1e-12||(Math.abs(candidateShare-best.share)<=1e-12&&(parts.shared<best.parts.shared||(parts.shared===best.parts.shared&&distance<best.distance))))best={value,parts,distance,approaches:candidateApproaches,share:candidateShare,penalty,sidewalkPenalty,attempt};
  }
  if(!constructionFresh(snapshot))return {error:'CONSTRUCTION_UNAVAILABLE'};
  if(timedOut||Date.now()>deadline){iterations.push({round:round+1,result:'time-limit',reasons:[...new Set(reasons)],attempts});status='time-limit';break;}
  if(!best){iterations.push({round:round+1,result:sawLimited?'search-limit':'no-improvement',reasons:[...new Set(reasons)],attempts});status=sawLimited?'search-limit':iterations.length>1?'improved':'no-improvement';break;}
  best.attempt.selected=true;
  iterations.push({round:round+1,result:'improved',improvementKind:best.attempt.improvementKind,previousSharedMetres:currentParts.shared,sharedMetres:best.parts.shared,previousSidewalkShare:(currentParts.sidewalk+otherSidewalk)/(currentDistance+(hasParent?other:0)),sidewalkShare:best.share,distanceMetres:best.distance,penalty:best.penalty,sidewalkPenalty:best.sidewalkPenalty,attempts});
  current=best.value;currentParts=best.parts;currentDistance=best.distance;currentApproaches=best.approaches;status=round+1===maxIterations?'iteration-limit':'improved';
 }
 if(!constructionFresh(snapshot))return {error:'CONSTRUCTION_UNAVAILABLE'};
 // A synchronous router cannot be preempted during projection/verification.
 // Never deliver an improvement if the total deadline expired in that work.
 let rolledBack=false;
 if(status==='time-limit'||Date.now()>deadline){status='time-limit';rolledBack=current!==base;current=base;currentParts=original;currentDistance=originalDistance;}
 if(rolledBack)for(const iteration of iterations)if(iteration.result==='improved')iteration.rolledBack=true;
 return {...current,pedestrianImprovement:{status,rolledBack,originalDistanceMetres:originalDistance,maxDistanceMetres:maxDistance,originalSharedMetres:original.shared,sharedMetres:currentParts.shared,originalFootwayMetres:original.footway,footwayMetres:currentParts.footway,originalExplicitSidewalkMetres:original.sidewalk,explicitSidewalkMetres:currentParts.sidewalk,originalSidewalkShare:(original.sidewalk+otherSidewalk)/(originalDistance+(hasParent?other:0)),sidewalkShare:(currentParts.sidewalk+otherSidewalk)/(currentDistance+(hasParent?other:0)),radiusMetres:radius,minimumReductionMetres:minimumReduction,searchLimits:{maxIterations,totalMs,maxVisited,maxComparisons:config.maxComparisons??100000},iterations}};
}

export function improvePedestrianRoute(base,start,end,options,snapshot,deps,config={}){
 try{return improvePedestrianRouteInner(base,start,end,options,snapshot,deps,config);}
 catch(error){
  if(error?.code!=='PROJECTION_LIMIT')throw error;
  if(!constructionFresh(snapshot))return {error:'CONSTRUCTION_UNAVAILABLE'};
  const checked=deps.verifyLocal({...base,coordinates:base.networkCoordinates||base.coordinates},start,end,options);
  if(checked.error||checked.geometryVerification!=='pedestrian-network-v1'||checked.policyVersion!==ROUTING_POLICY)throw error;
  const work=deps.checker.inspect(checked.coordinates);
  if(work.blocked.length)return {error:'CONSTRUCTION_BLOCKED',construction:work};
  if(!constructionFresh(snapshot))return {error:'CONSTRUCTION_UNAVAILABLE'};
  return {...base,...checked,construction:work,pedestrianImprovement:{status:'projection-limit',iterations:[]}};
 }
}
