import {constructionFresh} from './construction.mjs';

export function createConstructionDetourSearch({fetchSnapshot,createWorker,onState,onSnapshot=()=>{},timeoutMs=45000}){
 let version=0,worker=null,controller=null,timer=null;
 function cancel(notify=true){version++;controller?.abort();controller=null;worker?.terminate();worker=null;clearTimeout(timer);timer=null;if(notify)onState({status:'idle'});}
 async function start({startPlace,endPlace,options,url,ids,originalRoute,online,offlineSnapshot}){
  cancel();const id=version,abort=new AbortController();controller=abort;onState({status:'loading'});
  const finish=state=>{if(id!==version)return;version++;abort.abort();controller=null;worker?.terminate();worker=null;clearTimeout(timer);timer=null;onState(state);};
  timer=setTimeout(()=>finish({status:'error',message:'繞路搜尋逾時，原路線仍可查看。'}),timeoutMs);
  let snapshot;try{snapshot=online?await fetchSnapshot(abort.signal):offlineSnapshot;}catch{snapshot=null;}
  if(id!==version)return;
  if(!constructionFresh(snapshot)){finish({status:'error',message:'施工資料暫時無法確認，原路線仍可查看。'});return;}
  try{worker=createWorker();}catch{finish({status:'error',message:'路網資料暫時無法讀取。'});return;}
  worker.onerror=()=>finish({status:'error',message:'路網資料暫時無法讀取。'});
  worker.onmessage=({data:d})=>{
   if(id!==version)return;
   if(d.type==='ready')worker.postMessage({type:'avoid-construction',id,startPlace,endPlace,options,ids,construction:snapshot});
   else if(d.type==='avoid-construction'&&d.id===id){
    if(!constructionFresh(snapshot))finish({status:'error',message:'施工資料已過期，原路線仍可查看。'});
    else if(d.result?.error)finish({status:'error',message:d.result.error==='STALE_SELECTION'?'施工通報已更新，請重新查看。':'找不到繞過施工的路線，原路線仍可查看。'});
    else {onSnapshot(snapshot);finish({status:'ready',route:d.result,originalRoute});}
   }else if(d.type==='error')finish({status:'error',message:'路網資料暫時無法讀取。'});
  };
  worker.postMessage({type:'init',url});
 }
 return {start,cancel};
}
