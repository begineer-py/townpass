import {constructionFresh} from './construction.mjs';

// Owns a disposable worker so cancellation really interrupts graph search.
export function createNearbySearch({fetchSnapshot,createWorker,onState,onSnapshot=()=>{},timeoutMs=45000}){
 let version=0,worker=null,controller=null,timer=null;
 function cancel(notify=true){
  version++;controller?.abort();controller=null;worker?.terminate();worker=null;clearTimeout(timer);timer=null;
  if(notify)onState({status:'idle',candidates:[]});
 }
 async function start({startPlace,endPlace,options,url,online,offlineSnapshot}){
  cancel();const id=version;onState({status:'loading',candidates:[]});
  const abort=new AbortController();controller=abort;let currentWorker=null;
  const finish=state=>{
   if(id!==version)return;
   version++;abort.abort();controller=null;currentWorker?.terminate();worker=null;clearTimeout(timer);timer=null;onState(state);
  };
  timer=setTimeout(()=>finish({status:'error',candidates:[],message:'附近位置搜尋逾時，請稍後重試。'}),timeoutMs);
  let snapshot;
  try{snapshot=online?await fetchSnapshot(abort.signal):offlineSnapshot;}
  catch{finish({status:'error',candidates:[],message:'施工資料暫時不可用，請稍後重試。'});return;}
  if(id!==version)return;
  if(!constructionFresh(snapshot)){finish({status:'error',candidates:[],message:'施工資料暫時不可用，請稍後重試。'});return;}
  onSnapshot(snapshot);
  try{currentWorker=createWorker();}catch{finish({status:'error',candidates:[],message:'附近位置資料暫時無法讀取。'});return;}
  worker=currentWorker;
  currentWorker.onerror=()=>finish({status:'error',candidates:[],message:'附近位置資料暫時無法讀取。'});
  currentWorker.onmessage=({data:d})=>{
   if(id!==version)return;
   if(d.type==='ready')currentWorker.postMessage({type:'nearby-positions',id,startPlace,endPlace,options,construction:snapshot});
   else if(d.type==='nearby-positions'&&d.id===id){
    if(!constructionFresh(snapshot)||d.result.error)finish({status:'error',candidates:[],message:'施工資料已過期或暫時不可用，請重新搜尋。'});
    else finish({status:'ready',candidates:d.result.candidates,truncated:d.result.truncated});
   }else if(d.type==='error')finish({status:'error',candidates:[],message:'附近位置資料暫時無法讀取。'});
  };
  currentWorker.postMessage({type:'init',url});
 }
 return {start,cancel};
}
