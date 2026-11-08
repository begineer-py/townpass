import { Worker } from 'node:worker_threads';
import { join } from 'node:path';

// One warm graph per instance; active cancellation terminates its computation.
export function createRoutePool({createWorker=()=>new Worker(join(process.cwd(),'server','route-thread.mjs')),maxQueue=4,timeoutMs=55000}={}) {
 let worker=null,ready=false,active=null,queue=[],closed=false,epoch=0,warmers=0;
 const finish=(task,error,value)=>{if(task.done)return;task.done=true;clearTimeout(task.timer);task.signal?.removeEventListener('abort',task.abort);error?task.reject(error):task.resolve(value);};
 function destroy(){const previous=worker;worker=null;ready=false;epoch++;previous?.terminate();}
 function pump(){if(closed||active||!queue.length)return;if(!worker){start();return;}if(!ready)return;active=queue.shift();try{worker.postMessage(active.message);}catch(error){fail(error);}}
 function fail(error){const current=active,initializing=!ready;active=null;destroy();if(current)finish(current,error);if(initializing){while(queue.length)finish(queue.shift(),error);}else if(queue.length)pump();}
 function start(){
  if(worker||closed)return;const generation=++epoch;
  try{worker=createWorker();}catch(error){while(queue.length)finish(queue.shift(),error);return;}
  const current=worker;
  current.on('message',data=>{if(worker!==current||generation!==epoch)return;if(data?.type==='ready'){ready=true;pump();return;}if(data?.type==='error'&&data.id==null){fail(Error('ROUTING_INIT_FAILED'));return;}if(!active||data?.id!==active.message.id)return;const task=active;active=null;if(data.type==='error')finish(task,Error('ROUTING_ENGINE_ERROR'));else finish(task,null,data);pump();});
  current.on('error',error=>{if(worker===current&&generation===epoch)fail(error);});
  current.on('exit',code=>{if(worker===current&&generation===epoch)fail(Error(`ROUTING_ENGINE_EXIT_${code}`));});
  try{current.postMessage({type:'init',url:'http://route-data.internal/data/graph.json.gz'});}catch(error){if(worker===current&&generation===epoch)fail(error);}
 }
 function warm(){
  if(closed)return ()=>{};
  warmers++;if(!worker)start();let released=false;
  return ()=>{if(released)return;released=true;warmers--;if(!warmers&&!ready&&!active&&!queue.length)destroy();};
 }
 function execute(message,{signal}={}){
  if(closed)return Promise.reject(Error('ROUTING_CLOSED'));
  if(signal?.aborted)return Promise.reject(Error('ROUTING_CANCELLED'));
  if(queue.length+(active?1:0)>=maxQueue)return Promise.reject(Error('ROUTING_BUSY'));
  return new Promise((resolve,reject)=>{
   const task={message,signal,resolve,reject,done:false,timer:null,abort:null};
   task.abort=()=>{if(task.done)return;if(active===task){active=null;destroy();finish(task,Error('ROUTING_CANCELLED'));pump();}else{queue=queue.filter(item=>item!==task);finish(task,Error('ROUTING_CANCELLED'));}};
   signal?.addEventListener('abort',task.abort,{once:true});
   task.timer=setTimeout(()=>{if(task.done)return;if(active===task){active=null;destroy();}else queue=queue.filter(item=>item!==task);finish(task,Error('ROUTING_TIMEOUT'));pump();},timeoutMs);
   queue.push(task);pump();
  });
 }
 function dispose(){closed=true;destroy();if(active)finish(active,Error('ROUTING_CLOSED'));active=null;for(const task of queue)finish(task,Error('ROUTING_CLOSED'));queue=[];}
 return {warm,execute,dispose};
}
