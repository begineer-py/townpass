import {constructionFresh,CONSTRUCTION_MAX_AGE} from './construction.mjs';

// Keep the last fresh snapshot while updating, but never display expired work.
export function createConstructionFeed({fetchSnapshot,onState,now=()=>Date.now(),setTimer=setTimeout,clearTimer=clearTimeout,refreshMs=300000}){
 let active=false,snapshot=null,request=null,sequence=0,refreshTimer=null,expiryTimer=null;
 const emit=status=>{if(active)onState({status,snapshot});};
 const cancelTimer=name=>{if(name==='refresh'){clearTimer(refreshTimer);refreshTimer=null;}else{clearTimer(expiryTimer);expiryTimer=null;}};
 function scheduleRefresh(){cancelTimer('refresh');if(active)refreshTimer=setTimer(()=>{refreshTimer=null;void refresh();},refreshMs);}
 function scheduleExpiry(value){
  cancelTimer('expiry');const deadline=Math.min(Date.parse(value.fetchedAt),Date.parse(value.sourceUpdatedAt))+CONSTRUCTION_MAX_AGE;
  expiryTimer=setTimer(()=>{expiryTimer=null;if(!active||snapshot!==value)return;snapshot=null;emit('unavailable');void refresh();},Math.max(1,deadline-now()+1));
 }
 async function refresh(){
  if(!active)return;
  request?.abort();const controller=new AbortController();request=controller;const id=++sequence;
  if(snapshot&&!constructionFresh(snapshot,now())){snapshot=null;cancelTimer('expiry');}
  emit(snapshot?'ready':'loading');
  let result;try{result=await fetchSnapshot(controller.signal);}catch{result=null;}
  if(!active||id!==sequence)return;
  request=null;
  if(constructionFresh(result,now())){snapshot=result;scheduleExpiry(result);emit('ready');}
  else{if(snapshot&&!constructionFresh(snapshot,now())){snapshot=null;cancelTimer('expiry');}emit(snapshot?'update-failed':'unavailable');}
  scheduleRefresh();
 }
 function start(){if(active)return;active=true;void refresh();}
 function stop(){active=false;sequence++;request?.abort();request=null;cancelTimer('refresh');cancelTimer('expiry');snapshot=null;}
 return {start,stop,refresh};
}
