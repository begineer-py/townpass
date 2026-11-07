import {constructionFresh} from './construction.mjs';

// A disposable worker makes cancellation invalidate both the pending fetch and
// the search. It returns only the normal independently verified route result.
export function createLiveFollowSearch({fetchSnapshot,createWorker,onState,onSnapshot=()=>{},timeoutMs=45000,now=()=>Date.now()}){
 let version=0,worker=null,controller=null,timer=null;
 function cancel(){version++;controller?.abort();controller=null;worker?.terminate();worker=null;clearTimeout(timer);timer=null;}
 async function start({startPlace,endPlace,options,url,online,offlineSnapshot}){
  cancel();const id=version;onState({status:'loading'});
  const abort=new AbortController();controller=abort;let currentWorker=null;
  const finish=state=>{if(id!==version)return;version++;abort.abort();controller=null;currentWorker?.terminate();worker=null;clearTimeout(timer);timer=null;onState(state);};
  timer=setTimeout(()=>finish({status:'error',message:'重新規劃逾時，請再試一次。'}),timeoutMs);
  let snapshot;try{snapshot=online?await fetchSnapshot(abort.signal):offlineSnapshot;}
  catch{finish({status:'error',message:'施工資料暫時不可用，請稍後再試。'});return;}
  if(id!==version)return;
  if(!constructionFresh(snapshot,now())){finish({status:'error',message:'施工資料已過期，請重新連線。'});return;}
  onSnapshot(snapshot);
  try{currentWorker=createWorker();}catch{finish({status:'error',message:'路線資料暫時無法讀取。'});return;}
  worker=currentWorker;
  currentWorker.onerror=()=>finish({status:'error',message:'路線資料暫時無法讀取。'});
  currentWorker.onmessage=({data:d})=>{
   if(id!==version)return;
   if(d.type==='ready'){
    try{currentWorker.postMessage({type:'plan-places',id,startPlace,endPlace,options,construction:snapshot});}
    catch{finish({status:'error',message:'路線資料暫時無法讀取。'});}
   }
   else if(d.type==='route'&&d.id===id){
    if(!constructionFresh(snapshot,now()))finish({status:'error',message:'施工資料已過期，請重新規劃。'});
    else if(!Number.isFinite(startPlace.timestamp)||now()-startPlace.timestamp>30000||startPlace.timestamp>now()+5000)finish({status:'error',message:'位置已過期，正在等待新的定位。'});
    else if(d.result?.error)finish({status:'error',message:'暫時找不到符合條件的回線路徑，請確認附近通行狀況。',error:d.result.error});
    else finish({status:'ready',route:d.result,startPlace});
   }else if(d.type==='error')finish({status:'error',message:'路線資料暫時無法讀取。'});
  };
  try{currentWorker.postMessage({type:'init',url});}
  catch{finish({status:'error',message:'路線資料暫時無法讀取。'});}
 }
 return {start,cancel};
}
