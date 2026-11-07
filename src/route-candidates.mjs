import {generalSidewalkEdge} from './general-sidewalk.mjs';
import {crossingEvidence} from './crossing-evidence.mjs';
import {officialConditionMetrics,officialConditionScore} from './official-conditions.mjs';
import {constructionFresh} from './construction.mjs';
import {metres,ROUTING_POLICY} from './routing.mjs';
import {measureUnconfirmedApproaches,compareUnconfirmedApproaches,hasNewSidewalkNearReplaced,hasNewPedestrianNearShared,improvePedestrianRoute} from './pedestrian-improvement.mjs';

const walking=new Set(['footway','path','pedestrian','corridor']);
const rough=new Set(['gravel','unpaved','cobblestone','ground','sand','dirt']);
const sourceId=(g,i)=>g.edges[i]?.[5]?.derivedFrom??i;
const xy=p=>[p[1]*100700,p[0]*111195];
function overlap(a,b,c,d){
 const [x,y]=xy(a),[x2,y2]=xy(b),[u,v]=xy(c),[u2,v2]=xy(d),dx=x2-x,dy=y2-y,L=Math.hypot(dx,dy);if(L<.001)return 0;
 if(Math.abs(dx*(v-y)-dy*(u-x))/L>.02||Math.abs(dx*(v2-y)-dy*(u2-x))/L>.02)return 0;
 const t1=((u-x)*dx+(v-y)*dy)/L,t2=((u2-x)*dx+(v2-y)*dy)/L;
 return Math.max(0,Math.min(L,Math.max(t1,t2))-Math.max(0,Math.min(t1,t2)));
}
function lines(g,r){
 const map=new Map();for(const id of r.edgeIds){const e=g.edges[id],key=sourceId(g,id),line=[g.nodes[e[0]],...(e[4]||[]),g.nodes[e[1]]];
 if(!map.has(key))map.set(key,[]);for(let j=1;j<line.length;j++)map.get(key).push([line[j-1],line[j]]);}
 return map;
}
// Geometric overlap compares matching original edges, including derived projections.
export function routeOverlapRatio(graph,a,b,{deadline=Infinity,maxComparisons=100000}={}){
 const left=lines(graph,a),right=lines(graph,b);let shared=0,total=0,comparisons=0;
 for(const [key,segs] of left)for(const [p,q] of segs){const length=metres(p,q);total+=length;let matched=0;
  for(const [c,d] of right.get(key)||[]){if(++comparisons>maxComparisons||Date.now()>deadline)return null;matched+=overlap(p,q,c,d);}
  shared+=Math.min(length,matched);
 }
 const other=[...right.values()].flat().reduce((n,[p,q])=>n+metres(p,q),0);
 return Math.max(total,other)>0?Math.min(1,shared/Math.max(total,other)):1;
}
function measure(g,route,start,end){
 if(!Array.isArray(route.edgeIds)||!route.edgeIds.length||route.nodeIds?.length!==route.edgeIds.length+1)return null;
 const approaches=measureUnconfirmedApproaches(g,route,start,end);if(!approaches)return null;
 let network=0,shared=0,sidewalk=0,pedestrian=0,unknown=0,roughMetres=0;const unverifiedCrossings=[];
 for(let i=0;i<route.edgeIds.length;i++){
  const e=g.edges[route.edgeIds[i]],a=route.nodeIds[i],b=route.nodeIds[i+1];if(!e||!((e[0]===a&&e[1]===b)||(e[0]===b&&e[1]===a))||!Number.isFinite(e[2])||e[2]<=0)return null;
  const w=g.ways[e[3]],length=e[2];if(!w)return null;network+=length;
  const crossing=w.crossing===true||w.footway==='crossing',sourceProof=e[5]?.derivedFrom!=null?g.edges[e[5].derivedFrom]?.[5]:e[5];
  if(w.source==='osm-shared-street')shared+=length;
  else if(generalSidewalkEdge(w,sourceProof))sidewalk+=length;
  else if(walking.has(w.highway))pedestrian+=length;
  const evidence=crossingEvidence({...w,crossing},sourceProof);
  const crossingUnknown=crossing&&evidence!=='full';
  if(w.width==null||w.slope==null||w.surface==null||crossingUnknown)unknown+=length;
  if(crossingUnknown){const forward=e[0]===a;unverifiedCrossings.push({coordinates:[g.nodes[a].slice(0,2),...(forward?e[4]||[]:[...(e[4]||[])].reverse()),g.nodes[b].slice(0,2)],crossingCoverage:sourceProof?.crossingCoverage??null,coverageScope:e[5]?.derivedFrom!=null?'source-edge':'edge'});}
  if(rough.has(w.surface))roughMetres+=length;
 }
 const estimated=approaches.start.metres+approaches.end.metres;
 const distance=network+metres(start,g.nodes[route.nodeIds[0]])+metres(end,g.nodes[route.nodeIds.at(-1)]);
 return {distanceMetres:distance,explicitSidewalkMetres:sidewalk,otherPedestrianMetres:pedestrian,sharedMetres:shared,unknownMetres:unknown,roughMetres,estimatedMetres:estimated,unverifiedCrossings,approaches,...officialConditionMetrics(route.officialConditions)};
}
function score(m,shortest,conditionDetourLimit){
 const d=m.distanceMetres||1,detour=Math.max(0,m.distanceMetres-shortest);
 const scoreBreakdown={sidewalk:40*m.explicitSidewalkMetres/d,shared:-25*m.sharedMetres/d,unknown:-12*m.unknownMetres/d,rough:-10*m.roughMetres/d,estimated:-15*m.estimatedMetres/d,detour:-20*detour/(shortest||1),officialConditions:officialConditionScore(m.officialConditionWeight)};
 // Nearby official records are uncertain. Beyond the baseline detour budget,
 // only remove their relative scoring advantage; retain all other factors.
 if(Number.isFinite(conditionDetourLimit?.maxDistanceMetres) && d>conditionDetourLimit.maxDistanceMetres+1e-7){
  const baseline=officialConditionScore(conditionDetourLimit.baselineOfficialConditionWeight);
  scoreBreakdown.conditionDetourGuard=Math.min(0,baseline-scoreBreakdown.officialConditions);
 }
 const scoreRaw=Object.values(scoreBreakdown).reduce((a,b)=>a+(b??0),0);
 return {score:100/(1+Math.exp(-scoreRaw/20)),scoreRaw,scoreBreakdown,metrics:{...m,detourMetres:detour,detourRatio:shortest?m.distanceMetres/shortest:1}};
}
export function findRouteCandidates(base,start,end,options,snapshot,{graph,router,verifyLocal,checker},config={}){
 const limits={totalMs:config.totalMs??4000,maxVisited:config.maxVisited??40000,totalVisited:config.totalVisited??160000,maxAttempts:config.maxAttempts??18,maxComparisons:config.maxComparisons??100000,duplicateOverlap:config.duplicateOverlap??.9,radiusMetres:50,improvementRounds:config.improvementRounds??3,generationFraction:Math.max(0,Math.min(1,config.generationFraction??.5))};
 if(!constructionFresh(snapshot))return {error:'CONSTRUCTION_UNAVAILABLE'};
 if(base?.error)return base;
 if(base?.provider==='taipei-official')return {status:'unsupported-official-provenance',candidates:[],attempts:[],limits};
 const verifiedBase=verifyLocal({...base,coordinates:base.networkCoordinates||base.coordinates},start,end,options);if(verifiedBase.error||verifiedBase.geometryVerification!=='pedestrian-network-v1'||verifiedBase.policyVersion!==ROUTING_POLICY)return {error:'UNVERIFIED_NETWORK'};
 const baseWork=checker.inspect(verifiedBase.coordinates);if(baseWork.blocked.length)return {error:'CONSTRUCTION_BLOCKED'};
 const conditionDetourLimit=base.conditionDetourLimit;
 const initial={...verifiedBase,provider:base.provider,construction:baseWork,resolvedStart:base.resolvedStart,resolvedEnd:base.resolvedEnd,...(conditionDetourLimit?{conditionDetourLimit}:{})};
 const baseline=measure(graph,initial,start,end);if(!baseline)return {error:'UNVERIFIED_NETWORK'};
 const started=Date.now(),deadline=started+limits.totalMs,generationDeadline=started+limits.totalMs*limits.generationFraction,attempts=[],items=[{id:'baseline',route:initial,metrics:baseline,nearbyImprovement:null}];
 const generationVisited=Math.floor(limits.totalVisited*limits.generationFraction);
 let visited=0,status='search-limit';
 // Diagonal enumeration is incremental: limits, not a desired candidate count, stop search.
 for(let n=0;n<limits.maxAttempts;n++){
  if(Date.now()>generationDeadline){status='time-limit';break;}
  const remaining=generationVisited-visited;if(remaining<=0){status='visited-limit';break;}
  const grid=[[0,1],[1,0],[1,1],[0,2],[2,0],[2,1],[1,2],[2,2],[0,3],[3,0],[3,1],[1,3],[3,2],[2,3],[3,3]],pair=grid[n%grid.length],scale=2**Math.floor(n/grid.length),penalty=pair[0]*3*scale,sidewalkPenalty=pair[1]*2*scale;
  const a={penalty,sidewalkPenalty};attempts.push(a);
  const candidate=router(start,end,{...options,lineAllowed:checker.allowed,_optimizeSharedPenalty:penalty,_optimizeNonSidewalkPenalty:sidewalkPenalty,_optimizeDeadline:generationDeadline,_optimizeMaxVisited:Math.min(limits.maxVisited,remaining)});
  visited+=Number.isFinite(candidate.visited)?candidate.visited:Math.min(limits.maxVisited,remaining);
  if(Date.now()>generationDeadline){a.reason='time-limit';status='time-limit';break;}
  if(candidate.error){a.reason=candidate.error;continue;}
  const verified=verifyLocal(candidate,start,end,options);if(verified.error){a.reason='verification-failed';continue;}
  if(Date.now()>generationDeadline){a.reason='time-limit';status='time-limit';break;}
  const work=checker.inspect(verified.coordinates);if(work.blocked.length){a.reason='construction-blocked';continue;}
  if(Date.now()>generationDeadline){a.reason='time-limit';status='time-limit';break;}
  const route={...verified,provider:base.provider,construction:work,resolvedStart:base.resolvedStart,resolvedEnd:base.resolvedEnd,...(conditionDetourLimit?{conditionDetourLimit}:{})},m=measure(graph,route,start,end);
  if(!m){a.reason='invalid-provenance';continue;}
  const approachError=compareUnconfirmedApproaches(baseline.approaches,m.approaches);if(approachError){a.reason=approachError;continue;}
  if(m.distanceMetres>Math.min(baseline.distanceMetres*1.3,baseline.distanceMetres+300)+1e-7){a.reason='detour-limit';continue;}
  let duplicate=false,limited=false;for(const item of items){const overlap=routeOverlapRatio(graph,item.route,route,{deadline:generationDeadline,maxComparisons:limits.maxComparisons});if(overlap===null){limited=true;break;}if(overlap>=limits.duplicateOverlap){duplicate=true;break;}}
  if(limited){a.reason='comparison-limit';continue;}if(duplicate){a.reason='duplicate-geometry';continue;}
  const sidewalk=m.explicitSidewalkMetres/m.distanceMetres>baseline.explicitSidewalkMetres/baseline.distanceMetres?hasNewSidewalkNearReplaced(graph,initial,route,{radius:50,deadline:generationDeadline,maxComparisons:limits.maxComparisons}):{near:false};
  const shared=m.sharedMetres+1<=baseline.sharedMetres?hasNewPedestrianNearShared(graph,initial,route,{radius:50,deadline:generationDeadline,maxComparisons:limits.maxComparisons}):{near:false};
  if(Date.now()>generationDeadline){a.reason='time-limit';status='time-limit';break;}
  if(sidewalk.limited||shared.limited){a.reason='comparison-limit';continue;}
  a.reason='accepted';items.push({id:`candidate-${n+1}`,route,metrics:m,nearbyImprovement:{sidewalk:sidewalk.near,shared:shared.near}});
 }
 // Reserve a copy of the baseline: optimisation may add alternatives but cannot
 // replace or discard the original verified route.
 const pending=items.map(item=>({...item,improvement:{status:'pending',rounds:[]}}));
 for(let round=0;round<limits.improvementRounds;round++){
  let active=false;
  for(let i=0;i<pending.length;i++){
   const item=pending[i];if(item.improvement.status==='complete')continue;
   const remainingVisited=limits.totalVisited-visited,remainingMs=deadline-Date.now();
   if(remainingMs<=0||remainingVisited<=0){item.improvement.status=remainingMs<=0?'time-limit':'visited-limit';continue;}
   active=true;
   const remainingItems=Math.max(1,pending.length-i),sliceMs=Math.max(1,Math.floor(remainingMs/remainingItems)),sliceVisited=Math.max(1,Math.floor(remainingVisited/remainingItems));
   let consumed=0;
   const boundedRouter=(a,b,prefs)=>{
    const allowance=Math.min(limits.maxVisited,sliceVisited-consumed);
    if(allowance<=0||Date.now()>deadline)return {error:'OPTIMIZATION_BUDGET',visited:0};
    const result=router(a,b,{...prefs,_optimizeDeadline:Math.min(deadline,prefs._optimizeDeadline??deadline),_optimizeMaxVisited:allowance});
    const used=Number.isFinite(result.visited)?Math.max(0,Math.min(allowance,result.visited)):allowance;consumed+=used;return result;
   };
   const improved=improvePedestrianRoute(item.route,start,end,options,snapshot,{graph,router:boundedRouter,verifyLocal,checker},{
    totalMs:sliceMs,maxIterations:1,maxVisited:Math.min(limits.maxVisited,sliceVisited),maxComparisons:limits.maxComparisons,
    parentBaselineDistance:baseline.distanceMetres,otherLegDistance:0,otherLegSidewalkMetres:0});
   visited+=consumed;
   const state=improved?.pedestrianImprovement?.status||improved.error||'unavailable';
   item.improvement.rounds.push({round:round+1,status:state,visited:consumed});
   if(Date.now()>deadline||improved.error){item.improvement.status=Date.now()>deadline?'time-limit':state;continue;}
   const check=verifyLocal({...improved,coordinates:improved.networkCoordinates||improved.coordinates},start,end,options);
   if(check.error){item.improvement.status='verification-failed';continue;}
   const work=checker.inspect(check.coordinates),route={...check,provider:base.provider,construction:work,resolvedStart:base.resolvedStart,resolvedEnd:base.resolvedEnd,...(conditionDetourLimit?{conditionDetourLimit}:{})},m=measure(graph,route,start,end);
   if(Date.now()>deadline){item.improvement.status='time-limit';continue;}
   if(work.blocked.length||!m||m.distanceMetres>Math.min(baseline.distanceMetres*1.3,baseline.distanceMetres+300)+1e-7||compareUnconfirmedApproaches(baseline.approaches,m.approaches)){
    item.improvement.status='verification-rejected';continue;
   }
   item.route=route;item.metrics=m;
   item.improvement.status=['improved','iteration-limit'].includes(state)?'improved':'complete';
  }
  if(!active||Date.now()>deadline||visited>=limits.totalVisited)break;
 }
 for(const item of pending)if(item.improvement.status==='pending')item.improvement.status=Date.now()>deadline?'time-limit':'visited-limit';
 // Original verified candidates survive a timeout or a failed deduplication.
 // Improvements replace their own original only after proving distinction
 // from every other retained route; the baseline is always kept separately.
 const finalItems=items.map((item,i)=>({...item,improvement:pending[i].improvement}));
 for(let i=0;i<pending.length;i++){
  const item=pending[i];if(item.route===items[i].route||Date.now()>deadline)continue;
  let duplicate=false,limited=false;
  for(let j=0;j<finalItems.length;j++){
   if(i!==0&&j===i)continue;
   const ratio=routeOverlapRatio(graph,finalItems[j].route,item.route,{deadline,maxComparisons:limits.maxComparisons});
   if(ratio===null){limited=true;break;}if(ratio>=limits.duplicateOverlap){duplicate=true;break;}
  }
  if(!duplicate&&!limited){const changed={...item,nearbyImprovement:null};if(i===0)finalItems.push({...changed,id:'baseline-improved'});else finalItems[i]=changed;}
 }
 if(!constructionFresh(snapshot))return {error:'CONSTRUCTION_UNAVAILABLE'};
 const shortest=Math.min(...finalItems.map(x=>x.metrics.distanceMetres));
 const candidates=finalItems.map(item=>({...item,...score(item.metrics,shortest,conditionDetourLimit)})).sort((a,b)=>b.score-a.score||a.metrics.distanceMetres-b.metrics.distanceMetres||a.id.localeCompare(b.id));
 return {status,limits,attempts,visited,candidates,constructionSourceUpdatedAt:snapshot.sourceUpdatedAt,scoreMeaning:'ranking-only-not-safety',scoreFormula:'100 / (1 + exp(-sum(scoreBreakdown) / 20))'};
}
