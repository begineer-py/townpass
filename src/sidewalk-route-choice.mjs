import {constructionFresh} from './construction.mjs';
import {ROUTING_POLICY,metres} from './routing.mjs';
import {generalPedestrianSegment} from './general-sidewalk.mjs';
import {officialConditionMetrics,officialConditionScore} from './official-conditions.mjs';

const point=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
const close=(a,b)=>point(a)&&point(b)&&metres(a,b)<=.01;
const endpoints=(route,start,end)=>Array.isArray(route?.coordinates)&&route.coordinates.length>=2&&route.coordinates.every(point)&&close(route.coordinates[0],[start.lat,start.lon])&&close(route.coordinates.at(-1),[end.lat,end.lon]);
const conditions=route=>{
 const c=route?.officialConditions;
 // Missing records remain unknown for both routes. They should not prevent a
 // comparison based on verified sidewalk and shared-road geometry.
 if(c?.status==='unavailable')return {status:'unavailable',weight:null,fetchedAt:null,sourceObservedAt:null};
 if(c?.status!=='available'||typeof c.fetchedAt!=='string'||!Number.isFinite(Date.parse(c.fetchedAt))||!Array.isArray(c.points)||c.points.some(p=>!Number.isFinite(p.distanceMetres)||p.distanceMetres<0||typeof p.type!=='string'))return null;
 const weight=officialConditionMetrics(c).officialConditionWeight;
 return Number.isFinite(weight)?{status:'available',weight,fetchedAt:c.fetchedAt,sourceObservedAt:c.sourceObservedAt??null}:null;
};
// The condition overlay may split a verified edge into shorter collinear
// pieces. Accept those splits without accepting a shortcut across a bend.
function sameSegmentedLine(points,original){
 const network=[];for(const p of original)if(!network.length||metres(network.at(-1),p)>.000001)network.push(p);
 if(network.length<2||!close(points[0],network[0]))return false;
 let k=1;
 for(let i=1;i<network.length;i++){
  const a=network[i-1],b=network[i],dx=(b[1]-a[1])*100700,dy=(b[0]-a[0])*111195,den=dx*dx+dy*dy;let prior=0,arrived=false;
  while(k<points.length){const p=points[k],px=(p[1]-a[1])*100700,py=(p[0]-a[0])*111195,t=(px*dx+py*dy)/den;
   if(t<prior-1e-7||t>1+1e-7||Math.hypot(px-t*dx,py-t*dy)>.001)return false;
   prior=t;k++;if(metres(p,b)<=.001){arrived=true;break;}
  }
  if(!arrived)return false;
 }
 return k===points.length;
}
const constructionMatches=(route,snapshot)=>route?.construction?.sourceUpdatedAt===snapshot.sourceUpdatedAt&&Array.isArray(route.construction.blocked)&&route.construction.blocked.length===0;
function localMetrics(route){
 if(route?.policyVersion!==ROUTING_POLICY||route.geometryVerification!=='pedestrian-network-v1'||route.requiresEntryConfirmation||!Number.isFinite(route.distance)||route.distance<=0||!Array.isArray(route.tierSegments)||!route.tierSegments.length)return null;
 if(!Array.isArray(route.networkCoordinates)||route.networkCoordinates.length<2||route.networkCoordinates.some(p=>!point(p)))return null;
 let sidewalk=0,shared=0,network=0,previous=null;const points=[];
 for(const s of route.tierSegments){
  if(!Number.isFinite(s.distance)||s.distance<0||!Array.isArray(s.coordinates)||s.coordinates.length<2||s.coordinates.some(p=>!point(p))||typeof s.sharedRoad!=='boolean'||typeof s.explicitSidewalk!=='boolean'||typeof s.crossing!=='boolean')return null;
  if(previous&&metres(previous,s.coordinates[0])>.000001)return null;
  for(const p of s.coordinates)if(!points.length||metres(points.at(-1),p)>.000001)points.push(p);previous=s.coordinates.at(-1);
  network+=s.distance;
  if(s.sharedRoad)shared+=s.distance;
  else if(!s.crossing)sidewalk+=s.distance;
 }
 if(!sameSegmentedLine(points,route.networkCoordinates))return null;
 const expected=network+metres(route.coordinates[0],points[0])+metres(route.coordinates.at(-1),points.at(-1));
 if(Math.abs(route.distance-expected)>.501)return null;
 const c=conditions(route);if(!c)return null;
 let estimated=0;if(!Array.isArray(route.approaches))return null;
 for(const a of route.approaches){if(!Number.isFinite(a.distance)||a.distance<0)return null;if(a.estimated)estimated+=a.distance;}
 return {distance:route.distance,sidewalk,shared,estimated,joins:0,condition:c};
}
function officialMetrics(route){
 if(route?.kind!=='official-passageway'||route.verification!=='official-source-screened-v1'||route.navigationAllowed!==true||route.policyVersion!==ROUTING_POLICY||!/^[a-f0-9]{64}$/i.test(route.sourceHash||'')||!Number.isFinite(route.distanceMetres)||route.distanceMetres<=0||!Array.isArray(route.segments)||!route.segments.length)return null;
 let sidewalk=0,shared=0,estimated=0,joins=0,total=0,previous=null;const coords=[];
 for(const s of route.segments){
  if(!['official-line','osm','osm-join','source-join','endpoint-approach'].includes(s.kind)||!Number.isFinite(s.distanceMetres)||s.distanceMetres<0||!Array.isArray(s.coordinates)||s.coordinates.length<2||s.coordinates.some(p=>!point(p))||(previous&&metres(previous,s.coordinates[0])>.000001))return null;
  for(const p of s.coordinates)if(!coords.length||metres(coords.at(-1),p)>.000001)coords.push(p);
  previous=s.coordinates.at(-1);total+=s.distanceMetres;
  if(generalPedestrianSegment(s))sidewalk+=s.distanceMetres;
  if(s.kind==='osm'&&s.sharedRoad===true)shared+=s.distanceMetres;
  if(s.kind==='endpoint-approach')estimated+=s.distanceMetres;
  if(s.kind.endsWith('join'))joins++;
 }
 if(route.distance!==Math.round(total)||Math.abs(total-route.distanceMetres)>.001||coords.length!==route.coordinates.length||coords.some((p,i)=>metres(p,route.coordinates[i])>.000001))return null;
 const c=conditions(route);if(!c)return null;
 return {distance:total,sidewalk,shared,estimated,joins,condition:c};
}
function score(m,shortest,shortestConditionScore=officialConditionScore(m.condition.weight)){
 const d=m.distance,parts={sidewalk:40*m.sidewalk/d,shared:-25*m.shared/d,unknown:-12,estimated:-15*m.estimated/d,joins:-Math.min(10,2*m.joins),detour:-20*Math.max(0,d-shortest)/shortest,officialConditions:officialConditionScore(m.condition.weight)};
 const conditionLimit=Math.min(shortest*1.3,shortest+300);
 if(d>conditionLimit+.001)parts.conditionDetourGuard=Math.min(0,shortestConditionScore-parts.officialConditions);
 const raw=Object.values(parts).reduce((a,b)=>a+b,0);
 return {value:100/(1+Math.exp(-raw/20)),parts};
}
// Candidate scores in the worker/UI use different baselines. Recalculate the
// same conservative comparison for both routes: unknown conditions are not
// assumed safe, and only jointly available data influences selection.
export function chooseSidewalkImprovement(options){
 const {currentRoute,userSelected=false,following=false}=options;
 if(userSelected||following||currentRoute?.geometryVerification!=='pedestrian-network-v1')return null;
 const compared=compareSidewalkRouteScores(options);if(compared.status!=='ready')return null;
 const baseline=compared.current.metrics,baseScore=compared.current.score;
 const ranked=compared.referenceCandidates.filter(item=>{
  const m=item.metrics;
  return m.distance<=Math.min(baseline.distance*1.3,baseline.distance+300)+.001 &&
   m.shared<baseline.shared-1 && m.sidewalk/m.distance>baseline.sidewalk/baseline.distance+1e-7 && item.score.value>baseScore.value+1e-7;
 }).sort((a,b)=>b.score.value-a.score.value||a.metrics.distance-b.metrics.distance);
 if(!ranked.length)return null;
 const winner=ranked[0];return {candidate:winner.candidate,baseline:{...baseline,score:baseScore},improved:{...winner.metrics,score:winner.score},shortestDistanceMetres:compared.shortestDistanceMetres,scoreMeaning:compared.scoreMeaning};
}

// Produce display scores only when all compared routes can be measured from
// verified geometry, the same endpoints, construction and condition dataset.
// This has no side effects and never chooses or changes the user's route.
export function compareSidewalkRouteScores({currentRoute,localCandidates=[],referenceCandidates=[],start,end,snapshot,referenceSnapshot,referenceSourceHash}){
 const unavailable={status:'unavailable',localCandidates:[],referenceCandidates:[]};
 if(!start||!end||![start.lat,start.lon,end.lat,end.lon].every(Number.isFinite)||!constructionFresh(snapshot)||!constructionFresh(referenceSnapshot)||snapshot.sourceUpdatedAt!==referenceSnapshot.sourceUpdatedAt||!endpoints(currentRoute,start,end)||!constructionMatches(currentRoute,snapshot)||!Array.isArray(localCandidates)||!Array.isArray(referenceCandidates))return unavailable;
 const expectedHash=referenceSourceHash??referenceCandidates[0]?.route?.sourceHash;
 if(!/^[a-f0-9]{64}$/i.test(expectedHash||''))return unavailable;
 const current=localMetrics(currentRoute)||(currentRoute.sourceHash===expectedHash?officialMetrics(currentRoute):null);if(!current)return unavailable;
 const sameConditions=m=>m&&m.condition.status===current.condition.status&&m.condition.fetchedAt===current.condition.fetchedAt&&m.condition.sourceObservedAt===current.condition.sourceObservedAt;
 const local=[];for(const candidate of localCandidates){const route=candidate?.route;
  if(typeof candidate?.id!=='string'||!endpoints(route,start,end)||!constructionMatches(route,snapshot))continue;
  const metrics=localMetrics(route);if(sameConditions(metrics))local.push({candidate,metrics});
 }
 const reference=[];for(const candidate of referenceCandidates){const route=candidate?.route;
  if(typeof candidate?.id!=='string'||route?.sourceHash!==expectedHash||!endpoints(route,start,end)||!constructionMatches(route,referenceSnapshot))continue;
  const metrics=officialMetrics(route);if(sameConditions(metrics))reference.push({candidate,metrics});
 }
 // No common cross-source comparison is possible without one measurable
 // candidate on each side (the currently displayed local route counts).
 const currentIsLocal=currentRoute.geometryVerification==='pedestrian-network-v1';
 if(!reference.length||(!local.length&&!currentIsLocal))return unavailable;
 const all=[current,...local.map(item=>item.metrics),...reference.map(item=>item.metrics)];
 const shortest=Math.min(...all.map(item=>item.distance));
 const shortestConditionScore=Math.max(...all.filter(m=>Math.abs(m.distance-shortest)<.001).map(m=>officialConditionScore(m.condition.weight)));
 const result=item=>({...item,score:score(item.metrics,shortest,shortestConditionScore)});
 return {status:'ready',shortestDistanceMetres:shortest,scoreMeaning:'common-evidence-comparison',current:{route:currentRoute,metrics:current,score:score(current,shortest,shortestConditionScore)},localCandidates:local.map(result),referenceCandidates:reference.map(result),filteredLocalCount:localCandidates.length-local.length,filteredReferenceCount:referenceCandidates.length-reference.length};
}
