// Identical in-flight requests share one computation, but each caller keeps
// its own cancellation and request ID. Nothing is retained after completion.
export function createRouteCoalescer(pool){
 const groups=new Map();
 function execute(task,snapshot,{signal}={}){
  if(signal?.aborted)return Promise.reject(Error('ROUTING_CANCELLED'));
  if(!['plan-places','route'].includes(task?.type))return pool.execute({...task,construction:snapshot},{signal});
  const {id,...payload}=task;
  const key=JSON.stringify([snapshot?.sourceUpdatedAt,snapshot?.fetchedAt,payload]);
  let group=groups.get(key);
  if(!group){
   group={controller:new AbortController(),subscribers:new Set()};groups.set(key,group);
   const current=group;
   Promise.resolve().then(()=>pool.execute({...task,construction:snapshot},{signal:current.controller.signal})).then(
    result=>settle(current,null,result),error=>settle(current,error),
   );
   function settle(g,error,result){
    if(groups.get(key)===g)groups.delete(key);
    for(const subscriber of g.subscribers){subscriber.signal?.removeEventListener('abort',subscriber.cancel);error?subscriber.reject(error):subscriber.resolve({...result,id:subscriber.id});}
    g.subscribers.clear();
   }
  }
  const current=group;
  return new Promise((resolve,reject)=>{
   const subscriber={id,signal,resolve,reject,cancel:null};
   subscriber.cancel=()=>{if(!current.subscribers.delete(subscriber))return;signal?.removeEventListener('abort',subscriber.cancel);reject(Error('ROUTING_CANCELLED'));if(!current.subscribers.size){if(groups.get(key)===current)groups.delete(key);current.controller.abort();}};
   current.subscribers.add(subscriber);signal?.addEventListener('abort',subscriber.cancel,{once:true});
   if(signal?.aborted)subscriber.cancel();
  });
 }
 return {execute};
}
