import {constructionFresh,createConstructionChecker,workActive} from './construction.mjs';
import {metres,ROUTING_POLICY} from './routing.mjs';

// Treat only the user's chosen, current clear notices as temporary avoidance
// areas. The original feed and the resulting route's report remain unchanged.
export function planConstructionDetour(startPlace,endPlace,options,snapshot,ids,{plan,now=Date.now()}){
 if(!constructionFresh(snapshot,now))return {error:'CONSTRUCTION_UNAVAILABLE'};
 if(!Array.isArray(ids)||!ids.length||ids.length>50||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!id))return {error:'INVALID_SELECTION'};
 const selected=new Set(ids),works=snapshot.works.filter(w=>selected.has(w.id));
 if(works.length!==ids.length||works.some(w=>w.impact!=='clear'||!workActive({...w,hours:w.hours||''},now)||!w.geometries?.length))return {error:'STALE_SELECTION'};
 const temporary={...snapshot,works:snapshot.works.map(w=>selected.has(w.id)?{...w,impact:'blocked'}:w)};
 let avoidChecker,realChecker;
 try{avoidChecker=createConstructionChecker(temporary,now);realChecker=createConstructionChecker(snapshot,now);}catch{return {error:'CONSTRUCTION_UNAVAILABLE'};}
 const result=plan(startPlace,endPlace,options,temporary,avoidChecker);
 if(result?.error||!result)return {error:result?.error||'NO_DETOUR'};
 const a=result.resolvedStart||startPlace,b=result.resolvedEnd||endPlace;
 if(![a?.lat,a?.lon,b?.lat,b?.lon,startPlace?.lat,startPlace?.lon,endPlace?.lat,endPlace?.lon].every(Number.isFinite)||metres([a.lat,a.lon],[startPlace.lat,startPlace.lon])>.01||metres([b.lat,b.lon],[endPlace.lat,endPlace.lon])>.01||result.policyVersion!==ROUTING_POLICY||result.geometryVerification!=='pedestrian-network-v1'||!Array.isArray(result.coordinates))return {error:'UNVERIFIED_NETWORK'};
 let real,avoided;
 try{real=realChecker.inspect(result.coordinates);avoided=avoidChecker.inspect(result.coordinates);}catch{return {error:'UNVERIFIED_NETWORK'};}
 if(real.blocked.length||avoided.blocked.length)return {error:'NO_DETOUR'};
 const {routeCandidates,selectedCandidateId,...safe}=result;
 return {...safe,construction:real,constructionDetour:{ids}};
}
