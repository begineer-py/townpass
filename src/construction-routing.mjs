import {createConstructionChecker} from './construction.mjs';
export function routeAroundConstruction(candidate,start,end,options,snapshot,{router,verifyOfficial},now=Date.now()){
 let checker;try{checker=createConstructionChecker(snapshot,now);}catch{return {error:'CONSTRUCTION_UNAVAILABLE'};}
 const work=checker.inspect([start,...candidate.coordinates,end]);
 if(!work.blocked.length)return {...candidate,construction:work};
 const alternate=router(start,end,{...options,lineAllowed:checker.allowed});
 if(!alternate.error){
  const checked=verifyOfficial({...alternate,provider:'taipei-official',segmentPaths:[alternate.coordinates],crossingSegments:[]},start,end);
  if(!checked.error){
   const check=checker.inspect(checked.coordinates);
   if(!check.blocked.length)return {...checked,provider:'local-detour',construction:{...check,avoided:work.blocked.length}};
  }
 }
 return {error:'CONSTRUCTION_BLOCKED',construction:work};
}
