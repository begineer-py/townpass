import {polygonConnectorChecker,roadConnectorChecker} from './geometry.mjs';
import {officialGeometryEvidence} from './supplemental-evidence.mjs';
import {edgeAllowed,metres,ROUTING_POLICY,SNAP_METRES} from './routing.mjs';
const same=(a,b)=>a&&b&&a[0]===b[0]&&a[1]===b[1];
export function createLocalRouteVerifier(graph,facilities=[]){
 const {areas,crossings}=officialGeometryEvidence(graph),covered=polygonConnectorChecker(areas),roadClear=roadConnectorChecker(graph.roadGeometries,crossings);
 const entrances=new Map(facilities.filter(p=>p.kind==='metro-elevator').map(p=>[p.id,p]));
 return (route,start,end,options={})=>{
  if(route.error)return route;
  if(!Array.isArray(route.edgeIds)||!route.edgeIds.length||route.nodeIds?.length!==route.edgeIds.length+1)return {error:'UNVERIFIED_NETWORK'};
  const coordinates=[graph.nodes[route.nodeIds[0]]?.slice(0,2)];
  for(let i=0;i<route.edgeIds.length;i++){
   const e=graph.edges[route.edgeIds[i]],a=route.nodeIds[i],b=route.nodeIds[i+1];
   if(!e||!((e[0]===a&&e[1]===b)||(e[1]===a&&e[0]===b))||graph.nodes[a]?.[2]||graph.nodes[b]?.[2]||!edgeAllowed(graph.ways[e[3]],options,e[5]))return {error:'UNVERIFIED_NETWORK'};
   coordinates.push(...(e[0]===a?e[4]||[]:[...(e[4]||[])].reverse()),graph.nodes[b].slice(0,2));
  }
  if(coordinates.length!==route.coordinates?.length||coordinates.some((p,i)=>!same(p,route.coordinates[i])))return {error:'UNVERIFIED_NETWORK'};
  const approaches=[];
  for(const [point,target,place,side]of [[start,coordinates[0],options.startPlace,'start'],[end,coordinates.at(-1),options.endPlace,'end']]){
   const gap=metres(point,target),entry=entrances.get(place?.id);
   const matched=entry&&same(point,[entry.lat,entry.lon]);
   // The entire approach is checked against roads. A short official elevator-point link
   // is a positional estimate, explicitly labelled rather than claimed as surveyed pavement.
   if(gap>SNAP_METRES||!roadClear(point,target))return {error:'OFFICIAL_ENTRY_UNVERIFIED'};
   if(gap>0.001&&!covered(point,target)&&!(matched&&gap<=15))return {error:'OFFICIAL_ENTRY_UNVERIFIED'};
   if(gap>0.001)approaches.push({side,coordinates:side==='start'?[point,target]:[target,point],distance:Math.round(gap),estimated:!covered(point,target),name:entry?.name});
  }
  const all=[...coordinates];if(!same(start,all[0]))all.unshift(start);if(!same(end,all.at(-1)))all.push(end);
  return {...route,coordinates:all,networkCoordinates:coordinates,approaches,distance:Math.round(route.distance+metres(start,coordinates[0])+metres(end,coordinates.at(-1))),provider:'mapped-pedestrian',geometryVerification:'pedestrian-network-v1',policyVersion:ROUTING_POLICY,requiresEntryConfirmation:false};
 };
}
export function stationEntrances(place,facilities){
 if(!['20','station'].includes(String(place?.kind)))return [place];
 const key=s=>String(s||'').replace(/臺/g,'台').split(/[（(]/)[0].replace(/站$/,'');
 const found=facilities.filter(p=>p.kind==='metro-elevator'&&key(p.station)===key(place.name));
 return found.length?found.slice(0,4):[place];
}
export function planPlaces(startPlace,endPlace,options,snapshot,{router,verifyLocal,facilities,checker}){
 let last={error:'NO_ROUTE'},best=null;
 for(const a of stationEntrances(startPlace,facilities))for(const b of stationEntrances(endPlace,facilities)){
  const start=[a.lat,a.lon],end=[b.lat,b.lon],prefs={...options,startPlace:a,endPlace:b,lineAllowed:checker.allowed};
  const candidate=router(start,end,prefs);if(candidate.error){last=candidate;continue;}
  const checked=verifyLocal(candidate,start,end,prefs);if(checked.error){last=checked;continue;}
  const work=checker.inspect(checked.coordinates);if(work.blocked.length){last={error:'CONSTRUCTION_BLOCKED',construction:work};continue;}
  if(!best||checked.distance<best.distance)best={...checked,construction:work,resolvedStart:a,resolvedEnd:b};
 }
 return best||last;
}
