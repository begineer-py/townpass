import {polygonConnectorChecker,roadConnectorChecker} from './geometry.mjs';
import {officialGeometryEvidence} from './supplemental-evidence.mjs';
import {edgeAllowed,metres,ROUTING_POLICY,SNAP_METRES} from './routing.mjs';
import {edgeTier,edgeCostDetails} from './route-tiers.mjs';
const same=(a,b)=>a&&b&&a[0]===b[0]&&a[1]===b[1];
export function createLocalRouteVerifier(graph,facilities=[]){
 const {areas,crossings}=officialGeometryEvidence(graph),covered=polygonConnectorChecker(areas),roadClear=roadConnectorChecker(graph.roadGeometries,crossings);
 const entrances=new Map(facilities.filter(p=>p.kind==='metro-elevator').map(p=>[p.id,p]));
 function allowed(point,target,place,options={}){
  const gap=metres(point,target),entry=entrances.get(place?.id),matched=entry&&same(point,[entry.lat,entry.lon]);
  // A point already on a verified network node has no approach to cross a road.
  // This matters for a shared-street centreline, which is itself in the road mask.
  if(gap<=.001)return true;
  return gap<=SNAP_METRES&&roadClear(point,target)&&(gap<=.05||covered(point,target)||(matched&&!options.knownOnly));
 }
 const verify=(route,start,end,options={})=>{
  if(route.error)return route;
  if(!Array.isArray(route.edgeIds)||!route.edgeIds.length||route.nodeIds?.length!==route.edgeIds.length+1)return {error:'UNVERIFIED_NETWORK'};
  const coordinates=[graph.nodes[route.nodeIds[0]]?.slice(0,2)],tierSegments=[];
  for(let i=0;i<route.edgeIds.length;i++){
   const e=graph.edges[route.edgeIds[i]],a=route.nodeIds[i],b=route.nodeIds[i+1];
   if(!e||!((e[0]===a&&e[1]===b)||(e[1]===a&&e[0]===b))||graph.nodes[a]?.[2]||graph.nodes[b]?.[2]||!edgeAllowed(graph.ways[e[3]],options,e[5]))return {error:'UNVERIFIED_NETWORK'};
   const way=graph.ways[e[3]],middle=e[0]===a?e[4]||[]:[...(e[4]||[])].reverse();
   const segmentCoordinates=[graph.nodes[a].slice(0,2),...middle,graph.nodes[b].slice(0,2)];
   coordinates.push(...segmentCoordinates.slice(1));
   // Build visible condition and shared-road flags from the verified graph,
   // rather than trusting annotations on the candidate route.
   const tier=edgeTier(e[5]),unknownWidth=way.width==null,unknownSlope=way.slope==null,
    roughSurface=edgeCostDetails(way,e[5],options).surface>0,
    sharedRoad=way.source==='osm-shared-street';
   const last=tierSegments.at(-1);
   if(last?.tier===tier&&last.unknownWidth===unknownWidth&&last.unknownSlope===unknownSlope&&last.roughSurface===roughSurface&&last.sharedRoad===sharedRoad){
    last.coordinates.push(...segmentCoordinates.slice(1));last.distance+=e[2];
   }else tierSegments.push({tier,unknownWidth,unknownSlope,roughSurface,sharedRoad,coordinates:segmentCoordinates,distance:e[2]});
  }
  if(coordinates.length!==route.coordinates?.length||coordinates.some((p,i)=>!same(p,route.coordinates[i])))return {error:'UNVERIFIED_NETWORK'};
  const wayIds=new Set(route.edgeIds.map(id=>graph.edges[id][3]));
  if(!Array.isArray(route.steps)||route.steps.some(step=>!wayIds.has(step.way)))return {error:'UNVERIFIED_NETWORK'};
  const steps=route.steps.map(step=>{
   const way=graph.ways[step.way];
   return {...step,sharedRoad:way.source==='osm-shared-street'};
  });
  const approaches=[];
  for(const [point,target,place,side]of [[start,coordinates[0],options.startPlace,'start'],[end,coordinates.at(-1),options.endPlace,'end']]){
   const gap=metres(point,target),entry=entrances.get(place?.id);
   const matched=entry&&same(point,[entry.lat,entry.lon]);
   // The entire approach is checked against roads. A registered exit link
   // without polygon coverage is an estimate, not a surveyed walking path.
   if(!allowed(point,target,place,options))return {error:'OFFICIAL_ENTRY_UNVERIFIED'};
   if(gap>.05)approaches.push({side,coordinates:side==='start'?[point,target]:[target,point],distance:Math.round(gap),estimated:!covered(point,target),name:entry?.name});
  }
  const all=[...coordinates];if(!same(start,all[0]))all.unshift(start);if(!same(end,all.at(-1)))all.push(end);
  return {...route,steps,tierSegments,coordinates:all,networkCoordinates:coordinates,approaches,distance:Math.round(route.distance+metres(start,coordinates[0])+metres(end,coordinates.at(-1))),provider:'mapped-pedestrian',geometryVerification:'pedestrian-network-v1',policyVersion:ROUTING_POLICY,requiresEntryConfirmation:false};
 };
 verify.approachAllowed=allowed;
 return verify;
}
export function stationEntrances(place,facilities){
 if(!['20','station'].includes(String(place?.kind)))return [place];
 const key=s=>String(s||'').replace(/臺/g,'台').split(/[（(]/)[0].replace(/站$/,'');
 const found=facilities.filter(p=>p.kind==='metro-elevator'&&key(p.station)===key(place.name));
 return found.length?found.slice(0,4):[place];
}
// Used only to explain a failed construction-aware search. Never expose the
// unrestricted candidate as an available route.
export function diagnoseConstruction(start,end,prefs,snapshot,{router,verifyLocal,checker}){
 if(!snapshot?.works?.some(w=>w.impact!=='clear'&&w.geometries?.length))return null;
 const {lineAllowed,...diagnosticPrefs}=prefs;
 const candidate=router(start,end,diagnosticPrefs);
 if(candidate.error)return null;
 const checked=verifyLocal(candidate,start,end,diagnosticPrefs);
 if(checked.error)return null;
 const work=checker.inspect(checked.coordinates);
 return work.blocked.length?{error:'CONSTRUCTION_BLOCKED',construction:work}:null;
}
export function planPlaces(startPlace,endPlace,options,snapshot,{router,verifyLocal,facilities,checker}){
 let last={error:'NO_ROUTE'},best=null,blocked=null;
 const attempts=[],failures=[];
 function failed(result){last=result;failures.push(result);}
 for(const a of stationEntrances(startPlace,facilities))for(const b of stationEntrances(endPlace,facilities)){
  const start=[a.lat,a.lon],end=[b.lat,b.lon],prefs={...options,startPlace:a,endPlace:b,lineAllowed:checker.allowed,approachAllowed:(p,n,side)=>verifyLocal.approachAllowed(p,n,side==='start'?a:b,options)};
  attempts.push({start,end,prefs});
  const candidate=router(start,end,prefs);if(candidate.error){failed(candidate);continue;}
  const checked=verifyLocal(candidate,start,end,prefs);if(checked.error){failed(checked);continue;}
  const work=checker.inspect(checked.coordinates);if(work.blocked.length){blocked={error:'CONSTRUCTION_BLOCKED',construction:work};continue;}
  if(!best||checked.weightedCost<best.weightedCost)best={...checked,construction:work,resolvedStart:a,resolvedEnd:b};
 }
 if(best)return best;
 if(blocked)return blocked;
 // A closure can prevent the search from ever producing a candidate. Diagnose
 // only after all safe alternatives fail; the diagnostic route is never returned.
 for(const {start,end,prefs} of attempts){
  const diagnosis=diagnoseConstruction(start,end,prefs,snapshot,{router,verifyLocal,checker});
  if(diagnosis)return diagnosis;
 }
 // A failed entrance must not hide a different entrance that reached the
 // network but could not find a route. Keep unusual verification failures
 // visible instead of replacing them with ordinary search failures.
 const regular=new Set(['NO_ROUTE','NO_CONNECTION','SAME_POINT']);
 const selected=failures.find(f=>!regular.has(f.error))||failures.find(f=>f.error==='NO_ROUTE')||failures.find(f=>f.error==='NO_CONNECTION')||last;
 const attemptErrors={};for(const f of failures)attemptErrors[f.error]=(attemptErrors[f.error]||0)+1;
 return {...selected,attemptErrors};
}
