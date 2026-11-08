// Preserve the existing worker protocol without loading the route graph in the browser.
export function createBackendRouteWorker({endpoint='./api/route-compute',fetcher=fetch}={}) {
 let terminated=false;const controllers=new Set();
 const worker={onmessage:null,onerror:null,postMessage(message){
  if(terminated)return;
  if(message?.type==='init'){queueMicrotask(()=>{if(!terminated)worker.onmessage?.({data:{type:'ready'}})});return;}
  const controller=new AbortController();controllers.add(controller);
  const {construction,...task}=message;
  fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({task,constructionSourceUpdatedAt:construction?.sourceUpdatedAt}),signal:controller.signal,cache:'no-store'})
   .then(async response=>{if(!response.ok)throw Error('ROUTE_BACKEND_UNAVAILABLE');return response.json();})
   .then(data=>{if(!terminated&&!controller.signal.aborted)worker.onmessage?.({data});})
   .catch(error=>{if(!terminated&&!controller.signal.aborted)worker.onerror?.(error);})
   .finally(()=>controllers.delete(controller));
 },terminate(){terminated=true;for(const controller of controllers)controller.abort();controllers.clear();}};
 return worker;
}
