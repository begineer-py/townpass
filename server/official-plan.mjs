import {requestOfficialRoute,OFFICIAL_ROUTE_URL} from '../src/official-router.mjs';
import {searchVerifiedAlternatives} from '../src/alternative-routes.mjs';
import {canFallbackAfterVerification} from '../src/local-fallback.mjs';

// Bound upstream waits without accepting an unverified route. The parent
// signal still interrupts both requests and backend verification immediately.
function queryWithBudget(query,start,end,options,parent,timeoutMs){
 return new Promise((resolve,reject)=>{
  const controller=new AbortController();let done=false,timer;
  const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);parent?.removeEventListener('abort',cancel);error?reject(error):resolve(value);};
  const cancel=()=>{controller.abort();finish(Error('ROUTING_CANCELLED'));};
  if(parent?.aborted){cancel();return;}
  parent?.addEventListener('abort',cancel,{once:true});
  timer=setTimeout(()=>{controller.abort();finish(null,null);},Math.max(1,timeoutMs));
  Promise.resolve().then(()=>controller.signal.aborted?null:query(start,end,options,controller.signal,OFFICIAL_ROUTE_URL)).then(value=>finish(null,value),error=>finish(error));
 });
}

// Official search, local verification, detours and fallback all run server-side.
export async function planOfficialRoute(task,snapshot,{pool,signal,query=requestOfficialRoute,officialTimeoutMs=4000,detourBudgetMs=6000}={}){
 const {id,start,end,startPlace,endPlace,options={}}=task;
 const run=async message=>(await pool.execute({...message,id,construction:snapshot},{signal})).result;
 const fallback=()=>run({type:'plan-places',startPlace,endPlace,options});
 const official=await queryWithBudget(query,start,end,options,signal,officialTimeoutMs);
 if(signal?.aborted)throw Error('ROUTING_CANCELLED');
 if(!official||official.error)return fallback();
 let checked=await run({type:'verify-official',start,end,route:official,options});
 if(checked.error&&checked.detourWaypoints?.length){
  const deadline=Date.now()+detourBudgetMs;
  try{
   const alternatives=await searchVerifiedAlternatives({start,end,waypoints:checked.detourWaypoints,signal,
    query:async(a,b,via,s)=>{const remaining=deadline-Date.now();if(remaining<=0)throw Error('DETOUR_BUDGET');const candidate=await queryWithBudget(query,a,b,{...options,via},s,remaining);if(!candidate)throw Error('DETOUR_BUDGET');return candidate;},
    verify:route=>run({type:'verify-official',start,end,route,options})});
   if(alternatives.route)checked={...alternatives.route,alternativeAttempts:alternatives.attempts};
   else if(alternatives.error==='CONSTRUCTION_UNAVAILABLE')checked=alternatives;
  }catch(error){if(error?.message!=='DETOUR_BUDGET')throw error;}
 }
 if(canFallbackAfterVerification(checked.error))return fallback();
 return checked;
}
