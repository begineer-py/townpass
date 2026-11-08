// Preserve the existing worker protocol without loading the route graph in the browser.
import {constructionFresh} from './construction.mjs';
const expectedResponse = type => type==='plan-places'?'route':type==='verify-official'?'verified-official':type;
export function validBackendRouteResponse(message,data){
 return !!message && !!data && typeof data==='object' && !Array.isArray(data) &&
  data.type===expectedResponse(message.type) && data.id===message.id &&
  !!data.result && typeof data.result==='object' && !Array.isArray(data.result);
}
export function createBackendRouteWorker({endpoint='./api/route-compute',fetcher=fetch,timeoutMs=55000}={}) {
 let terminated=false;const requests=new Map();
 const worker={onmessage:null,onerror:null,postMessage(message){
  if(terminated)return;
  if(message?.type==='init'){queueMicrotask(()=>{if(!terminated)worker.onmessage?.({data:{type:'ready'}})});return;}
  const controller=new AbortController();let finished=false;
  const finish=(error,data)=>{
   if(finished)return;finished=true;const timer=requests.get(controller);clearTimeout(timer);requests.delete(controller);
   if(terminated)return;
   if(error){controller.abort();worker.onerror?.(error);}
   else if(!controller.signal.aborted)worker.onmessage?.({data});
  };
  const timer=setTimeout(()=>finish(Error('ROUTE_BACKEND_TIMEOUT')),timeoutMs);requests.set(controller,timer);
  const {construction,loadConstruction,...task}=message;
  let pending;
  try{pending=fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({task,constructionSourceUpdatedAt:construction?.sourceUpdatedAt}),signal:controller.signal,cache:'no-store'});}
  catch(error){finish(error);return;}
  const response=Promise.resolve(pending).then(async r=>{if(!r.ok){let body;try{body=await r.json()}catch{};throw Error(body?.error==='ROUTING_BUSY'?'ROUTING_BUSY':'ROUTE_BACKEND_UNAVAILABLE');}return r.json();});
  const snapshot=typeof loadConstruction==='function'?Promise.resolve().then(()=>loadConstruction(controller.signal)).then(value=>{if(!constructionFresh(value))throw Error('CONSTRUCTION_UNAVAILABLE');return value;}):Promise.resolve(null);
  Promise.all([response,snapshot])
   .then(([data,fresh])=>{
    if(!validBackendRouteResponse(message,data))throw Error('ROUTE_BACKEND_INVALID_RESPONSE');
    if(fresh && data.constructionSourceUpdatedAt!==fresh.sourceUpdatedAt)throw Error('CONSTRUCTION_UNAVAILABLE');
    finish(null,data);
   })
   .catch(error=>{if(!finished&&!controller.signal.aborted)finish(error);});
 },terminate(){terminated=true;for(const [controller,timer] of requests){clearTimeout(timer);controller.abort();}requests.clear();}};
 return worker;
}
