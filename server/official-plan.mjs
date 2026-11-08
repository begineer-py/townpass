import {requestOfficialRoute,OFFICIAL_ROUTE_URL} from '../src/official-router.mjs';
import {searchVerifiedAlternatives} from '../src/alternative-routes.mjs';
import {canFallbackAfterVerification} from '../src/local-fallback.mjs';

// Official search, local verification, detours and fallback all run server-side.
export async function planOfficialRoute(task,snapshot,{pool,signal,query=requestOfficialRoute}={}){
 const {id,start,end,startPlace,endPlace,options={}}=task;
 const run=async message=>(await pool.execute({...message,id,construction:snapshot},{signal})).result;
 const fallback=()=>run({type:'plan-places',startPlace,endPlace,options});
 const official=await query(start,end,options,signal,OFFICIAL_ROUTE_URL);
 if(signal?.aborted)throw Error('ROUTING_CANCELLED');
 if(official.error)return fallback();
 let checked=await run({type:'verify-official',start,end,route:official,options});
 if(checked.error&&checked.detourWaypoints?.length){
  const alternatives=await searchVerifiedAlternatives({start,end,waypoints:checked.detourWaypoints,signal,
   query:(a,b,via,s)=>query(a,b,{...options,via},s,OFFICIAL_ROUTE_URL),
   verify:route=>run({type:'verify-official',start,end,route,options})});
  if(alternatives.route)checked={...alternatives.route,alternativeAttempts:alternatives.attempts};
  else if(alternatives.error==='CONSTRUCTION_UNAVAILABLE')checked=alternatives;
 }
 if(canFallbackAfterVerification(checked.error))return fallback();
 return checked;
}
