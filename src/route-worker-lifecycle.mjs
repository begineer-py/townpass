// The main route worker is reused while idle. A busy cancellation destroys it
// because message-based cancellation cannot interrupt synchronous graph search.
export function createRouteWorkerLifecycle({createWorker,initMessage,onReady=()=>{},onMessage=()=>{},onDropped=()=>{},onError=()=>{}}){
 let worker=null,generation=0,ready=false,active=null,queued=null,disposed=false;
 const matches=(message,type,id)=>message?.type===type&&message.id===id;
 function drop(message){if(message)onDropped(message);}
 function pump(){
  if(disposed||!worker||!ready||active||!queued)return;
  const message=queued;queued=null;active=message;
  try{worker.postMessage(message);}catch(error){fail(error);}
 }
 function fail(error){
  const old=worker;worker=null;generation++;ready=false;
  old?.terminate();drop(active);drop(queued);active=null;queued=null;onReady(false);onError(error);
 }
 function start(){
  if(disposed||worker)return;
  const epoch=++generation;ready=false;onReady(false);
  let current;
  try{current=createWorker();worker=current;}catch(error){worker=null;onError(error);return;}
  current.onmessage=({data})=>{
   if(disposed||worker!==current||generation!==epoch)return;
   if(data?.type==='ready'){ready=true;onReady(true);pump();return;}
   if(data?.type==='error'){
    if(data.id!=null&&(!active||data.id!==active.id))return;
    fail(data);return;
   }
   const expected=active?.type==='verify-official'?'verified-official':'route';
   if(!active||data?.type!==expected||data.id!==active.id)return;
   active=null;onMessage(data);
   if(!disposed&&worker===current&&generation===epoch)pump();
  };
  current.onerror=error=>{if(!disposed&&worker===current&&generation===epoch)fail(error);};
  try{current.postMessage(initMessage);}catch(error){fail(error);}
 }
 function postMessage(message){
  if(disposed||!worker||!['route','plan-places','verify-official'].includes(message?.type))return false;
  if(queued)drop(queued);queued=message;pump();return !!worker;
 }
 function cancel(){
  drop(queued);queued=null;
  if(!active)return;
  const old=worker;worker=null;generation++;ready=false;drop(active);active=null;
  old?.terminate();start();
 }
 function cancelIfActive(type,id){
  if(matches(active,type,id)){cancel();return true;}
  if(matches(queued,type,id)){const item=queued;queued=null;drop(item);return true;}
  return false;
 }
 function dispose(){
  if(disposed)return;disposed=true;generation++;const old=worker;worker=null;ready=false;
  old?.terminate();drop(active);drop(queued);active=null;queued=null;
 }
 return {start,postMessage,cancel,cancelIfActive,dispose,isReady:()=>ready&&!disposed};
}
