import {generalSidewalkEdge} from './general-sidewalk.mjs';
import {crossingEvidence} from './crossing-evidence.mjs';
import {officialConditionMetrics,officialConditionScore} from './official-conditions.mjs';
import {constructionFresh} from './construction.mjs';
import {metres,ROUTING_POLICY} from './routing.mjs';
import {measureUnconfirmedApproaches} from './pedestrian-improvement.mjs';

const xy=p=>[p[1]*100700,p[0]*111195];
const length=line=>line.slice(1).reduce((n,p,i)=>n+metres(line[i],p),0);
function pointSegment(p,a,b){const [x,y]=xy(p),[ax,ay]=xy(a),[bx,by]=xy(b),dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(x-ax-t*dx,y-ay-t*dy);}
// Symmetric length-weighted sampling. It is a conservative approximation,
// never evidence of an actual graph connection or local access.
export function compareRouteGeometry(a,b,{toleranceMetres=3,minCoverage=.95,sampleMetres=5,maxComparisons=200000,deadline=Infinity}={}){
 if(!Array.isArray(a)||!Array.isArray(b)||a.length<2||b.length<2)return {status:'undetermined'};
 let count=0;
 function covered(line,other){let total=0,matched=0;
  for(let i=1;i<line.length;i++){const p=line[i-1],q=line[i],d=metres(p,q),n=Math.max(1,Math.ceil(d/sampleMetres));
   for(let j=0;j<n;j++){
    const t=(j+.5)/n,x=[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t];let best=Infinity;
    for(let k=1;k<other.length;k++){if(++count>maxComparisons||Date.now()>deadline)return null;best=Math.min(best,pointSegment(x,other[k-1],other[k]));if(best<=toleranceMetres)break;}
    total+=d/n;if(best<=toleranceMetres)matched+=d/n;
   }
  }
  return total>0?matched/total:null;
 }
 const forward=covered(a,b);if(forward==null)return {status:'undetermined'};
 const reverse=covered(b,a);if(reverse==null)return {status:'undetermined'};
 return {status:forward>=minCoverage&&reverse>=minCoverage?'similar':'different',forwardCoverage:forward,reverseCoverage:reverse,toleranceMetres,sampleMetres};
}
function localMetrics(graph,route,start,end){
 if(!route.edgeIds?.length)return null;const approaches=measureUnconfirmedApproaches(graph,route,start,end);if(!approaches)return null;
 let sidewalk=0,shared=0,other=0,unknown=0,rough=0,network=0;
 const roughValues=new Set(['gravel','unpaved','cobblestone','ground','sand','dirt']);
 for(const id of route.edgeIds){const e=graph.edges[id],w=e&&graph.ways[e[3]];if(!w||!Number.isFinite(e[2]))return null;network+=e[2];
  const crossing=w.crossing===true||w.footway==='crossing',sourceProof=e[5]?.derivedFrom!=null?graph.edges[e[5].derivedFrom]?.[5]:e[5];
  if(w.source==='osm-shared-street')shared+=e[2];else if(generalSidewalkEdge(w,sourceProof))sidewalk+=e[2];else if(['footway','path','pedestrian','corridor'].includes(w.highway))other+=e[2];
  if(w.width==null||w.slope==null||w.surface==null||(crossing&&crossingEvidence({...w,crossing},sourceProof)!=='full'))unknown+=e[2];
  if(roughValues.has(w.surface))rough+=e[2];
 }
 return {distanceMetres:network+metres(start,graph.nodes[route.nodeIds[0]])+metres(end,graph.nodes[route.nodeIds.at(-1)]),explicitSidewalkMetres:sidewalk,sharedMetres:shared,otherPedestrianMetres:other,unknownMetres:unknown,roughMetres:rough,estimatedMetres:approaches.start.metres+approaches.end.metres,unverifiedCrossings:route.crossingUncertainties||[],...officialConditionMetrics(route.officialConditions)};
}
// The source's segment paths must exactly reconstruct the verified network
// line before their non-crossing lengths can be counted as sidewalk.
function officialSidewalkMetres(route,networkLine){
 if(!Array.isArray(route.segmentPaths)||!Array.isArray(route.crossingSegments)||!Array.isArray(networkLine))return null;
 const key=line=>JSON.stringify(line),crossings=new Set(route.crossingSegments.map(key)),points=[];let sidewalk=0;
 for(const line of route.segmentPaths){
  if(!Array.isArray(line)||line.length<2||line.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))return null;
  if(points.length&&metres(points.at(-1),line[0])>.001)return null;
  for(const p of line)if(!points.length||metres(points.at(-1),p)>.001)points.push(p);
  if(!crossings.has(key(line)))sidewalk+=length(line);
 }
 const network=[];for(const p of networkLine)if(!network.length||metres(network.at(-1),p)>.001)network.push(p);
 if(points.length!==network.length||points.some((p,i)=>metres(p,network[i])>.001))return null;
 return sidewalk;
}
export function compareOfficialAndLocal(official,start,end,options,snapshot,{graph,verifyOfficial,verifyLocal,checker},config={}){
 if(!constructionFresh(snapshot))return {error:'CONSTRUCTION_UNAVAILABLE'};
 if(!verifyLocal.endpointAllowed(start,options.startPlace,'start')||!verifyLocal.endpointAllowed(end,options.endPlace,'end'))return {error:'OFFICIAL_ENTRY_UNVERIFIED'};
 if(official?.provider!=='taipei-official'||official.geometryVerification!=='official-polygons-and-crossings-v1'||official.policyVersion!==ROUTING_POLICY)return {error:'OFFICIAL_PATH_UNVERIFIED'};
 const original={...official,coordinates:official.networkCoordinates||official.coordinates};
 const checked=verifyOfficial(original,start,end);if(checked.error)return checked;
 const officialWork=checker.inspect(checked.coordinates);if(officialWork.blocked.length)return {error:'CONSTRUCTION_BLOCKED'};
 const officialRoute={...checked,approaches:official.approaches||[],networkCoordinates:original.coordinates,construction:officialWork};
 const distance=length(officialRoute.coordinates);if(!Number.isFinite(distance)||distance<=0)return {error:'OFFICIAL_INVALID'};
 officialRoute.distance=Math.round(distance);
 const officialSidewalk=officialSidewalkMetres(officialRoute,original.coordinates);
 const officialMetrics={distanceMetres:distance,explicitSidewalkMetres:officialSidewalk,sharedMetres:null,otherPedestrianMetres:null,unknownMetres:null,roughMetres:null,estimatedMetres:null,...officialConditionMetrics(officialRoute.officialConditions)};
 const candidates=[{id:'official',route:officialRoute,metrics:officialMetrics,geometryComparison:'reference'}],rejected=[];
 const deadline=Date.now()+(config.totalMs??2000),maxComparisons=config.maxComparisons??200000;
 for(const item of config.localCandidates||[]){
  if(Date.now()>deadline){rejected.push({id:item.id,reason:'time-limit'});break;}
  const source=item.route;if(!source||source.provider==='taipei-official'||source.geometryVerification!=='pedestrian-network-v1'||source.policyVersion!==ROUTING_POLICY){rejected.push({id:item.id,reason:'invalid-local-provenance'});continue;}
  const checkedLocal=verifyLocal({...source,coordinates:source.networkCoordinates||source.coordinates},start,end,options);
  if(checkedLocal.error){rejected.push({id:item.id,reason:'verification-failed'});continue;}
  const work=checker.inspect(checkedLocal.coordinates);if(work.blocked.length){rejected.push({id:item.id,reason:'construction-blocked'});continue;}
  const route={...checkedLocal,provider:source.provider,construction:work,resolvedStart:source.resolvedStart,resolvedEnd:source.resolvedEnd},metrics=localMetrics(graph,route,start,end);
  if(!metrics){rejected.push({id:item.id,reason:'invalid-local-provenance'});continue;}
  let similar=null,undetermined=false;const comparisons=[];
  for(const existing of candidates){
   const cmp=compareRouteGeometry(existing.route.coordinates,route.coordinates,{deadline,maxComparisons});
   comparisons.push({id:existing.id,...cmp});
   if(cmp.status==='similar'){similar={id:existing.id,...cmp};break;}
   if(cmp.status==='undetermined')undetermined=true;
  }
  if(similar){rejected.push({id:item.id,reason:'similar-geometry',geometryComparison:similar});continue;}
  if(undetermined){rejected.push({id:item.id,reason:'geometry-unresolved',geometryEvidence:comparisons});continue;}
  candidates.push({id:item.id,route,metrics,geometryComparison:'different',geometryEvidence:comparisons});
 }
 if(!constructionFresh(snapshot))return {error:'CONSTRUCTION_UNAVAILABLE'};
 const shortest=Math.min(...candidates.map(x=>x.metrics.distanceMetres));
 // Proximity records are not confirmed blockages. Past the ordinary detour
 // budget, removing such records alone must not make the longer option rank
 // above the shortest verified route. Keep the option and its real metrics:
 // other documented differences may still justify recommending it.
 const shortestConditionScore=Math.max(...candidates.filter(c=>Math.abs(c.metrics.distanceMetres-shortest)<1e-7).map(c=>officialConditionScore(c.metrics.officialConditionWeight)));
 // The official source lacks edge attributes; its entire route is treated as
 // unknown by policy without inventing actual zero values for those attributes.
 for(const c of candidates){
  const m=c.metrics,d=m.distanceMetres,officialCandidate=c.id==='official',detour=Math.max(0,d-shortest);
  const parts={sidewalk:m.explicitSidewalkMetres==null?null:40*m.explicitSidewalkMetres/d,shared:officialCandidate?null:-25*m.sharedMetres/d,
   unknown:-12*(officialCandidate?d:m.unknownMetres)/d,rough:officialCandidate?null:-10*m.roughMetres/d,
   estimated:officialCandidate?null:-15*m.estimatedMetres/d,detour:-20*detour/shortest,
   officialConditions:officialConditionScore(m.officialConditionWeight)};
  const conditionDetourLimit=Math.min(shortest*1.3,shortest+300);
  parts.conditionDetourGuard=d>conditionDetourLimit+1e-7?Math.min(0,shortestConditionScore-parts.officialConditions):0;
  const raw=Object.values(parts).reduce((sum,v)=>sum+(v??0),0);
  c.scoreRaw=raw;c.score=100/(1+Math.exp(-raw/20));c.scoreBreakdown=parts;
  c.metrics={...m,detourMetres:detour,detourRatio:d/shortest};
  c.scoreType='shared-evidence-ranking';
  c.assumptions=officialCandidate?['official-attributes-missing-whole-route-penalty']:[];
  if(officialCandidate)c.unknownAssessmentMetres=d;
 }
 return {status:rejected.some(x=>x.reason==='geometry-unresolved'||x.reason==='time-limit')?'comparison-limited':'partial-evidence',candidates,rejected,constructionSourceUpdatedAt:snapshot.sourceUpdatedAt,scoreMeaning:'ranking-only-not-safety',scoreFormula:'100 / (1 + exp(-sum(available scoreBreakdown) / 20))',unavailableMetrics:[...(officialSidewalk==null?['explicitSidewalkMetres']:[]),'sharedMetres','otherPedestrianMetres','unknownMetres','roughMetres','estimatedMetres'],crossSourceAttributeComparison:'unsupported-official-edge-provenance'};
}
