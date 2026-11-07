import {constructionFresh} from './construction.mjs';
import {metres,ROUTING_POLICY} from './routing.mjs';

// Share the app's serialized worker. Cancelling never changes an existing
// endpoint; late replies and stale construction are discarded.
export function createMapSnapSearch({fetchSnapshot,getLifecycle,onState=()=>{},onSnapshot=()=>{},timeoutMs=45000}){
 let version=0,pending=null,controller=null,timer=null;
 function finish(result,notify=true){
  if(!pending)return;const task=pending;pending=null;version++;controller?.abort();controller=null;clearTimeout(timer);timer=null;
  if(notify)onState(result.error?{status:'error',error:result.error}:{status:'ready',result});
  task.resolve(result);
 }
 function cancel(notify=true){const task=pending;if(!task){version++;controller?.abort();controller=null;clearTimeout(timer);timer=null;if(notify)onState({status:'idle'});return;}finish({error:'CANCELLED'},false);task.lifecycle?.cancelIfActive('snap-map-point',task.id);if(notify)onState({status:'idle'});}
 function handleMessage(d){const task=pending;if(!task||d?.type!=='snap-map-point'||d.id!==task.id)return false;
  const r=d.result,original=[task.place.lat,task.place.lon],valid=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=24.9&&p[0]<=25.3&&p[1]>=121.4&&p[1]<=121.8;
  if(!constructionFresh(task.snapshot))finish({error:'CONSTRUCTION_UNAVAILABLE'});
  else if(r?.error)finish({error:r.error});
  else if(!valid(r?.point)||!valid(r.original)||metres(r.original,original)>.001||!Number.isFinite(r.distanceMetres)||r.distanceMetres<0||r.distanceMetres>30+1e-7||Math.abs(metres(r.point,original)-r.distanceMetres)>.01||r.policyVersion!==ROUTING_POLICY||r.originalAccess!=='unconfirmed'||!['osm','official-line'].includes(r.source)||!['osm-and-official','osm-only'].includes(r.coverage)||r.constructionSourceUpdatedAt!==task.snapshot.sourceUpdatedAt)finish({error:'SNAP_UNVERIFIED'});
  else{onSnapshot(task.snapshot);finish(r);}
  return true;
 }
 function handleDropped(message){if(pending&&message?.type==='snap-map-point'&&message.id===pending.id){finish({error:'SNAP_INTERRUPTED'});return true;}return false;}
 function start({place,side,options,online,offlineSnapshot}){
  cancel(false);const id=++version,abort=new AbortController();controller=abort;onState({status:'loading'});
  const promise=new Promise(resolve=>{pending={id,place,side,resolve,lifecycle:null,snapshot:null};});
  timer=setTimeout(()=>{const task=pending;if(!task||task.id!==id)return;finish({error:'SNAP_TIMEOUT'});task.lifecycle?.cancelIfActive('snap-map-point',id);},timeoutMs);
  void (async()=>{
   if(!place||place.originKind!=='map'||!/^point-\d+$/.test(String(place.id||''))||!['start','end'].includes(side)||![place.lat,place.lon].every(Number.isFinite)){finish({error:'SNAP_INVALID'});return;}
   let snapshot;try{snapshot=online?await fetchSnapshot(abort.signal):offlineSnapshot;}catch{snapshot=null;}
   if(!pending||pending.id!==id)return;if(!constructionFresh(snapshot)){finish({error:'CONSTRUCTION_UNAVAILABLE'});return;}
   const lifecycle=getLifecycle();if(!lifecycle){finish({error:'SNAP_UNAVAILABLE'});return;}
   pending.snapshot=snapshot;pending.lifecycle=lifecycle;
   if(!lifecycle.postMessage({type:'snap-map-point',id,point:[place.lat,place.lon],place,side,options,construction:snapshot}))finish({error:'SNAP_BUSY'});
  })();
  return promise;
 }
 return {start,cancel,handleMessage,handleDropped};
}
