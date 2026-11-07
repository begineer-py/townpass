import {createConstructionChecker} from './construction.mjs';
export function resolveVerifiedRoute(candidate,start,end,options,snapshot,deps,now=Date.now()){
 let checked=deps.verifyOfficial(candidate,start,end);
 if(checked.error){
  if(!['OFFICIAL_PATH_UNVERIFIED','OFFICIAL_ROAD_CONFLICT','OFFICIAL_CROSSING_UNVERIFIED','OFFICIAL_ENTRY_UNVERIFIED'].includes(checked.error))return checked;
  let checker;try{checker=createConstructionChecker(snapshot,now);}catch{return {error:'CONSTRUCTION_UNAVAILABLE'};}
  const alternate=deps.router(start,end,{...options,lineAllowed:checker.allowed});
  if(alternate.error)return checked;
  const verified=deps.verifyLocal ? deps.verifyLocal(alternate,start,end,options) : deps.verifyOfficial({...alternate,provider:'taipei-official',segmentPaths:[alternate.coordinates],crossingSegments:[]},start,end);
  if(verified.error)return checked;
  checked={...verified,provider:'local-verified'};
 }
 return routeAroundConstruction(checked,start,end,options,snapshot,deps,now);
}
export function routeAroundConstruction(candidate,start,end,options,snapshot,{router,verifyOfficial,verifyLocal},now=Date.now()){
 let checker;try{checker=createConstructionChecker(snapshot,now);}catch{return {error:'CONSTRUCTION_UNAVAILABLE'};}
 const work=checker.inspect([start,...candidate.coordinates,end]);
 if(!work.blocked.length)return {...candidate,construction:work};
 const alternate=router(start,end,{...options,lineAllowed:checker.allowed});
 if(!alternate.error){
  const checked=verifyLocal ? verifyLocal(alternate,start,end,options) : verifyOfficial({...alternate,provider:'taipei-official',segmentPaths:[alternate.coordinates],crossingSegments:[]},start,end);
  if(!checked.error){
   const check=checker.inspect(checked.coordinates);
   if(!check.blocked.length)return {...checked,provider:'local-detour',construction:{...check,avoided:work.blocked.length}};
  }
 }
 return {error:'CONSTRUCTION_BLOCKED',construction:work};
}
