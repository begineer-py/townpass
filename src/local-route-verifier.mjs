import {polygonConnectorChecker,roadConnectorChecker} from './geometry.mjs';
import {officialGeometryEvidence} from './supplemental-evidence.mjs';
import {edgeAllowed,metres,ROUTING_POLICY,SNAP_METRES} from './routing.mjs';
import {restoreOfficialConditionCost} from './official-condition-cost.mjs';
import {edgeTier,edgeCostDetails} from './route-tiers.mjs';
import {crossingEvidence,crossingUncertainty} from './crossing-evidence.mjs';
import {constructionFresh} from './construction.mjs';
import {officialConditionMetrics} from './official-conditions.mjs';
const same=(a,b)=>a&&b&&a[0]===b[0]&&a[1]===b[1];
const localFirstFloorAddress=p=>/^(?:1|1f|一樓|一楼)$/i.test(String(p?.['addr:floor']??'').trim());
// OSM level 0 is ground; Taiwanese labels 1F / 一樓 also denote ground.
// Any ambiguous explicit level or indoor-only point fails closed. No level
// or indoor metadata on its own is not evidence that the point is ground.
function incompatibleFloor(p){
 if(!p)return false;
 const text=[p.name,p.description].filter(x=>typeof x==='string').join(' ');
 if(/地下|地庫|地下室|頂樓|屋頂|basement|underground|rooftop/i.test(text))return true;
 if(/(?:^|[^A-Za-z0-9])B\s*\d+(?:\s*F)?(?=$|[^A-Za-z])/i.test(text))return true;
 let textGround=false;
 for(const m of text.matchAll(/(?:^|[^A-Za-z0-9])(\d{1,2})\s*F(?=$|[^A-Za-z])/gi)){
  if(Number(m[1])!==1)return true;textGround=true;
 }
 for(const m of text.matchAll(/(\d+|[一二三四五六七八九十壹貳參]+)\s*[樓楼層层]/g)){
  if(!['1','一','壹'].includes(m[1]))return true;textGround=true;
 }
 let explicitGround=false;
 for(const key of ['level','floor','addr:floor','addr:level','level:ref','repeat_on','layer','building:level']){
  const v=p[key];if(v==null)continue;
  // The OSM level index is zero based. Other unparsed values are unknown.
  const s=String(v).trim();
  // addr:floor is a locally displayed address label, not the zero-based
  // `level` index. In Taiwan a first-floor label alone is not a known upper
  // floor; it does not establish ground-level entry or physical accessibility.
  if(key==='addr:floor'&&localFirstFloorAddress(p))continue;
  if(!/^[+-]?\d+(?:\.\d+)?$/.test(s)||Number(s)!==0)return true;
  explicitGround=true;
 }
 // Other unknown level:* tags may encode a level restriction we cannot parse.
 if(Object.keys(p).some(k=>k.startsWith('level:')&&k!=='level:ref'))return true;
 const location=String(p.location||'').toLowerCase();
 if(location&&!['surface','outdoor','indoor'].includes(location))return true;
 const indoor=p.indoor!=null&&!['','no','false','0'].includes(String(p.indoor).toLowerCase());
 const building=(p.building!=null&&!['','no','false','0'].includes(String(p.building).toLowerCase()))||Object.keys(p).some(k=>k.startsWith('building:'));
 if((indoor||building||location==='indoor')&&!explicitGround&&!textGround)return true;
 return false;
}
export function createLocalRouteVerifier(graph,facilities=[],places=[]){
 const {areas,crossings}=officialGeometryEvidence(graph),covered=polygonConnectorChecker(areas),roadClear=roadConnectorChecker(graph.roadGeometries,crossings);
 const poiKinds=new Set(['metro-elevator','place','health','park','rest','water','toilet','public-toilet','elevator','1','3','4','7','8','9','14','15','16','18']);
 const registered=new Map(),prohibitedPoints=new Set(),unmatchedOsmPoints=new Set();
 const pointKey=p=>`${p[0]}:${p[1]}`;
 function prohibited(p){
  if(!p)return false;
  if(incompatibleFloor(p))return true;
  const ok=new Set(['yes','designated','permissive']);
  if([p.access,p.foot].some(v=>v!=null&&!ok.has(v))||p.wheelchair==='no')return true;
  if(p.barrier!=null&&!['no','kerb'].includes(p.barrier))return true;
  if(p.kerb==='raised'||['no','private'].includes(p.entrance)||p.door==='locked'||p['door:locked']==='yes')return true;
  if(p['kerb:height']!=null){const height=Number(String(p['kerb:height']).replace(/\s*m\s*$/,''));if(!Number.isFinite(height)||height>.03)return true;}
  return Object.keys(p).some(k=>k.startsWith('access:')||k.startsWith('foot:')||k==='oneway:foot'||k==='wheelchair:conditional'||k==='wheelchair:forward'||k==='wheelchair:backward');
 }
 for(const p of [...facilities,...places]){
  if(!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lon))continue;
  if(prohibited(p))prohibitedPoints.add(pointKey([p.lat,p.lon]));
  if(!p.id||!poiKinds.has(String(p.kind)))continue;
  if((p.sourceId==='osm'||/^osm-[nw]\d+$/.test(String(p.id)))&&p.osmRestrictionsMatched!==true)unmatchedOsmPoints.add(pointKey([p.lat,p.lon]));
  // Duplicate IDs are ambiguous, even if coordinates match: the two records
  // could disagree about access restrictions.
  if(registered.has(p.id))registered.set(p.id,null);
  else registered.set(p.id,p);
 }
 function matchedPoint(point,place){
  const known=registered.get(place?.id);
  return known&&same(point,[known.lat,known.lon])?known:null;
 }
 function estimateSourceMatched(known){
  // PBF identity mismatch means the source restrictions for this OSM point
  // are unknown; do not turn it into an estimated connector.
  const osm=known?.sourceId==='osm'||/^osm-[nw]\d+$/.test(String(known?.id||''));
  return !osm||known.osmRestrictionsMatched===true;
 }
 function userPoint(point,place,side){
  if(!['start','end'].includes(side)||!place||!same(point,[place.lat,place.lon]))return null;
  if(place.originKind==='map'&&place.kind==null&&place.sourceId==null&&/^point-\d+$/.test(String(place.id||'')))return 'map';
  if(side==='start'&&place.originKind==='gps'&&place.kind==null&&place.sourceId==null&&place.id==='my-location'&&['browser','townpass'].includes(place.locationSource)&&
     (place.accuracy===null||(Number.isFinite(place.accuracy)&&place.accuracy>=0)))return 'gps';
  // User-selected search results can be positional estimates even when the
  // search provider has no registered POI record. Do not use this path to
  // bypass an ambiguous/registered ID or an unverified OSM object identity.
  if(place.selectionKind==='user'&&place.originKind==null&&place.id&&!registered.has(place.id)&&!/^osm-[nw]\d+$/.test(String(place.id)))return 'selected';
  return null;
 }
 function endpointAllowed(point,place,side){
  if(!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite))return false;
  const known=matchedPoint(point,place),origin=userPoint(point,place,side);
  return !(prohibitedPoints.has(pointKey(point))||prohibited(known)||prohibited(place)||(origin&&unmatchedOsmPoints.has(pointKey(point)))||
    (place?.originKind!=null&&!origin)||(place?.id&&registered.has(place.id)&&!known));
 }
 function allowed(point,target,place,options={},side=null){
  const gap=metres(point,target),known=matchedPoint(point,place),origin=userPoint(point,place,side);
  if(!endpointAllowed(point,place,side))return false;
  if(options.knownOnly&&localFirstFloorAddress(known))return false;
  // A point already on a verified network node has no approach to cross a road.
  // This matters for a shared-street centreline, which is itself in the road mask.
  if(gap<=.001)return true;
  if(origin&&gap>.05&&options.knownOnly)return false;
  return !!(gap<=SNAP_METRES&&roadClear(point,target)&&(gap<=.05||covered(point,target)||((known&&estimateSourceMatched(known)||origin)&&!unmatchedOsmPoints.has(pointKey(point))&&!options.knownOnly)));
 }
 const verify=(route,start,end,options={})=>{
  if(route.error)return route;
  if(!Array.isArray(route.edgeIds)||!route.edgeIds.length||route.nodeIds?.length!==route.edgeIds.length+1)return {error:'UNVERIFIED_NETWORK'};
  const projection=graph._routeProjectionState;
  if(projection&&(route.edgeIds.some(id=>id>=projection.baseEdges||graph.edges[id]?.[5]?.derivedFrom!=null)||route.nodeIds.some(id=>id>=projection.baseNodes))&&route.projectionEpoch!==projection.epoch)return {error:'UNVERIFIED_NETWORK'};
  const coordinates=[graph.nodes[route.nodeIds[0]]?.slice(0,2)],tierSegments=[],crossingUncertainties=[],verifiedSegments=[];
  let networkDistance=0;
  for(let i=0;i<route.edgeIds.length;i++){
   const e=graph.edges[route.edgeIds[i]],a=route.nodeIds[i],b=route.nodeIds[i+1];
   if(!e||!((e[0]===a&&e[1]===b)||(e[1]===a&&e[0]===b))||graph.nodes[a]?.[2]||graph.nodes[b]?.[2]||!edgeAllowed(graph.ways[e[3]],options,e[5]))return {error:'UNVERIFIED_NETWORK'};
   if(!Number.isFinite(e[2])||e[2]<=0)return {error:'UNVERIFIED_NETWORK'};
   networkDistance+=e[2];
   const way=graph.ways[e[3]],middle=e[0]===a?e[4]||[]:[...(e[4]||[])].reverse();
   const segmentCoordinates=[graph.nodes[a].slice(0,2),...middle,graph.nodes[b].slice(0,2)];
   coordinates.push(...segmentCoordinates.slice(1));
   // Build visible condition and shared-road flags from the verified graph,
   // rather than trusting annotations on the candidate route.
   const tier=edgeTier(e[5]),unknownWidth=way.width==null,unknownSlope=way.slope==null,
    roughSurface=edgeCostDetails(way,e[5],options).surface>0,
    sharedRoad=way.source==='osm-shared-street',crossing=way.crossing===true||way.footway==='crossing',explicitSidewalk=way.highway==='footway'&&way.footway==='sidewalk'&&!sharedRoad,crossEvidence=crossingEvidence(way,e[5]);
   verifiedSegments.push({way:e[3],start:segmentCoordinates[0],crossingEvidence:crossEvidence});
   const uncertainty=crossingUncertainty(way,e[5],segmentCoordinates);if(uncertainty)crossingUncertainties.push(uncertainty);
   const last=tierSegments.at(-1);
   if(last?.tier===tier&&last.unknownWidth===unknownWidth&&last.unknownSlope===unknownSlope&&last.roughSurface===roughSurface&&last.sharedRoad===sharedRoad&&last.explicitSidewalk===explicitSidewalk&&last.crossing===crossing&&last.crossingEvidence===crossEvidence){
    last.coordinates.push(...segmentCoordinates.slice(1));last.distance+=e[2];
   }else tierSegments.push({tier,unknownWidth,unknownSlope,roughSurface,sharedRoad,explicitSidewalk,crossing,crossingEvidence:crossEvidence,coordinates:segmentCoordinates,distance:e[2]});
  }
  if(coordinates.length!==route.coordinates?.length||coordinates.some((p,i)=>!same(p,route.coordinates[i])))return {error:'UNVERIFIED_NETWORK'};
  const wayIds=new Set(route.edgeIds.map(id=>graph.edges[id][3]));
  if(!Array.isArray(route.steps)||route.steps.some(step=>!wayIds.has(step.way)))return {error:'UNVERIFIED_NETWORK'};
  let stepCursor=0;
  const steps=route.steps.map(step=>{
   const way=graph.ways[step.way];
   let match=-1;
   if(Number.isFinite(step.lat)&&Number.isFinite(step.lon))
    match=verifiedSegments.findIndex((segment,index)=>index>=stepCursor&&segment.way===step.way&&same(segment.start,[step.lat,step.lon]));
   if(match<0)match=verifiedSegments.findIndex((segment,index)=>index>=stepCursor&&segment.way===step.way);
   // If a legacy synthetic step has no coordinates, choose the most
   // conservative evidence for its verified way rather than trusting it.
   const candidates=verifiedSegments.filter(segment=>segment.way===step.way).map(segment=>segment.crossingEvidence);
   const evidence=match>=0?verifiedSegments[match].crossingEvidence:candidates.includes('none')?'none':candidates.includes('partial')?'partial':candidates.includes('full')?'full':null;
   if(match>=0)stepCursor=match+1;
   return {...step,crossing:way.crossing===true,crossingEvidence:evidence,sharedRoad:way.source==='osm-shared-street'};
  });
  const approaches=[];
  for(const [point,target,place,side]of [[start,coordinates[0],options.startPlace,'start'],[end,coordinates.at(-1),options.endPlace,'end']]){
   const gap=metres(point,target),known=matchedPoint(point,place);
   // The entire approach is checked against roads. A registered point link
   // without polygon coverage is an estimate, not a surveyed walking path.
   if(!allowed(point,target,place,options,side))return {error:'OFFICIAL_ENTRY_UNVERIFIED'};
   const firstFloor=localFirstFloorAddress(known);
   if(gap>.05||firstFloor){const origin=userPoint(point,place,side),estimated=!!origin||firstFloor||!covered(point,target);
    approaches.push({side,coordinates:side==='start'?[point,target]:[target,point],distance:Math.round(gap),estimated,name:known?.name,...(origin?{originKind:origin}:{}),...((origin||firstFloor)?{unconfirmed:true,entryStatus:'unconfirmed'}:{})});}
  }
  const all=[...coordinates];if(!same(start,all[0]))all.unshift(start);if(!same(end,all.at(-1)))all.push(end);
  const officialConditions=graph.officialConditionIndex
   ? {status:'available',fetchedAt:graph.officialConditionIndex.fetchedAt,sourceObservedAt:graph.officialConditionIndex.sourceObservedAt,points:graph.officialConditionIndex.find(all,10)}
   : {status:'unavailable',points:[]};
  return {...route,steps,tierSegments,crossingUncertainties,officialConditions,coordinates:all,networkCoordinates:coordinates,approaches,distance:Math.round(networkDistance+metres(start,coordinates[0])+metres(end,coordinates.at(-1))),provider:'mapped-pedestrian',geometryVerification:'pedestrian-network-v1',policyVersion:ROUTING_POLICY,requiresEntryConfirmation:false};
 };
 verify.approachAllowed=allowed;
 verify.endpointAllowed=endpointAllowed;
 // The worker uses the same endpoint policy to classify an official
 // connector; a source marker alone never proves access or safety.
 verify.userPointKind=(point,place,side)=>endpointAllowed(point,place,side)?userPoint(point,place,side):null;
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
export function planPlaces(startPlace,endPlace,options,snapshot,{router,verifyLocal,facilities,checker,graph}){
 let last={error:'NO_ROUTE'},best=null,blocked=null;
 let bestCost=Infinity;
 const attempts=[],failures=[];
 function failed(result){last=result;failures.push(result);}
 attemptsLoop: for(const a of stationEntrances(startPlace,facilities))for(const b of stationEntrances(endPlace,facilities)){
  const start=[a.lat,a.lon],end=[b.lat,b.lon],prefs={...options,_ignoreOfficialConditions:false,startPlace:a,endPlace:b,lineAllowed:checker.allowed,approachAllowed:(p,n,side)=>verifyLocal.approachAllowed(p,n,side==='start'?a:b,options,side)};
  attempts.push({start,end,prefs});
  let candidate;
  try{candidate=router(start,end,prefs);}catch(error){
   if(error?.code!=='PROJECTION_LIMIT'||!best)throw error;
   return constructionFresh(snapshot)?{...best,routeSearchStatus:'projection-limit'}:{error:'CONSTRUCTION_UNAVAILABLE'};
  }
  if(candidate.error){failed(['NO_ROUTE','NO_CONNECTION'].includes(candidate.error)?{...candidate,failedPair:{start:a,end:b}}:candidate);continue;}
  const checked=verifyLocal(candidate,start,end,prefs);if(checked.error){failed(checked);continue;}
  const work=checker.inspect(checked.coordinates);if(work.blocked.length){blocked={error:'CONSTRUCTION_BLOCKED',construction:work};continue;}
  let chosen=checked,chosenWork=work,conditionDetourLimit,capacityExhausted=false;
  // Compare only routes for the same resolved endpoints, with the same
  // restrictions and construction snapshot. This preference may not turn a
  // nearby map observation into an unbounded detour.
  if(graph?.officialConditionIndex){
   if(!constructionFresh(snapshot))return {error:'CONSTRUCTION_UNAVAILABLE'};
   const baselinePrefs={...prefs,_ignoreOfficialConditions:true};
   let baselineCandidate;
   try{baselineCandidate=router(start,end,baselinePrefs);}catch(error){
    if(error?.code!=='PROJECTION_LIMIT')throw error;
    capacityExhausted=true;baselineCandidate={error:'PROJECTION_LIMIT'};
   }
   const withinDeadline=()=>!Number.isFinite(prefs._optimizeDeadline)||Date.now()<=prefs._optimizeDeadline;
   if(!constructionFresh(snapshot))return {error:'CONSTRUCTION_UNAVAILABLE'};
   if(!baselineCandidate.error&&withinDeadline()){
    const baseline=verifyLocal(baselineCandidate,start,end,baselinePrefs);
    if(!baseline.error&&withinDeadline()){
     const baselineWork=checker.inspect(baseline.coordinates);
     if(!baselineWork.blocked.length&&Number.isFinite(baseline.distance)&&baseline.distance>0&&Number.isFinite(checked.distance)){
      const maxDistanceMetres=Math.min(baseline.distance*1.3,baseline.distance+300);
      const applied=checked.distance>maxDistanceMetres+1e-7;
      conditionDetourLimit={baselineDistanceMetres:baseline.distance,maxDistanceMetres,baselineOfficialConditionWeight:officialConditionMetrics(baseline.officialConditions).officialConditionWeight,applied};
      if(applied){
       const repriced=restoreOfficialConditionCost(graph,baseline,prefs);
       if(repriced){chosen=repriced;chosenWork=baselineWork;}
       else conditionDetourLimit={...conditionDetourLimit,applied:false,reason:'baseline-cost-unavailable'};
      }
     }
    }
   }
   if(!constructionFresh(snapshot))return {error:'CONSTRUCTION_UNAVAILABLE'};
  }
  if(!best||chosen.weightedCost<bestCost){bestCost=chosen.weightedCost;best={...chosen,construction:chosenWork,resolvedStart:a,resolvedEnd:b,...(conditionDetourLimit?{conditionDetourLimit}:{}),...(capacityExhausted?{conditionDetourComparison:'projection-limit'}:{})};}
  if(capacityExhausted){best={...best,routeSearchStatus:'projection-limit'};break attemptsLoop;}
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
