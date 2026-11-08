// Warm the route graph and construction data after an explicit planning action.
// This request contains no location and never blocks the user interface.
export function createRoutePrewarmer({fetcher=fetch,now=()=>Date.now(),cooldownMs=30000}={}){
 let pending=null,readyUntil=0;
 return function prewarm(){
  if(pending)return pending;
  if(now()<readyUntil)return Promise.resolve(true);
  const task=Promise.resolve().then(()=>fetcher('./api/route-compute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({task:{type:'warmup',id:0}}),signal:AbortSignal.timeout(30000),cache:'no-store'}))
   .then(async response=>{if(!response.ok)return false;const data=await response.json();return data?.type==='warmup'&&data.id===0&&data.result?.ready===true;})
   .then(ready=>{if(ready)readyUntil=now()+cooldownMs;return ready;},()=>false)
   .finally(()=>{if(pending===task)pending=null;});
  pending=task;return task;
 };
}
export const prewarmRouteEngine=createRoutePrewarmer();
