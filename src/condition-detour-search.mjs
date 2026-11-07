import {constructionFresh} from './construction.mjs';

// An isolated worker can be stopped without disturbing the currently shown route.
export function createConditionDetourSearch({fetchSnapshot,createWorker,onState,onSnapshot=()=>{},timeoutMs=45000}){
 let version=0,worker=null,controller=null,timer=null;
 function cancel(notify=true){version++;controller?.abort();controller=null;worker?.terminate();worker=null;clearTimeout(timer);timer=null;if(notify)onState({status:'idle'});}
 async function start({startPlace,endPlace,options,url,targets,online,offlineSnapshot}){
  cancel();const id=version;onState({status:'loading'});
  const abort=new AbortController();controller=abort;let current=null;
  const finish=state=>{if(id!==version)return;version++;abort.abort();controller=null;current?.terminate();worker=null;clearTimeout(timer);timer=null;onState(state);};
  timer=setTimeout(()=>finish({status:'error',message:'繞路搜尋逾時，原路線仍可查看。'}),timeoutMs);
  let snapshot;
  try{snapshot=online?await fetchSnapshot(abort.signal):offlineSnapshot;}catch{finish({status:'error',message:'施工資料暫時不可用，原路線仍可查看。'});return;}
  if(id!==version)return;
  if(!constructionFresh(snapshot)){finish({status:'error',message:'施工資料已過期，請稍後再試。'});return;}
  try{current=createWorker();}catch{finish({status:'error',message:'路網資料暫時無法讀取。'});return;}
  worker=current;current.onerror=()=>finish({status:'error',message:'路網資料暫時無法讀取。'});
  current.onmessage=({data:d})=>{
   if(id!==version)return;
   if(d.type==='ready')current.postMessage({type:'avoid-official-condition',id,startPlace,endPlace,options,targets,construction:snapshot});
   else if(d.type==='avoid-official-condition'&&d.id===id){
    if(!constructionFresh(snapshot))finish({status:'error',message:'施工資料已過期，請重新搜尋。'});
    else if(d.result.error)finish({status:'error',message:d.result.error==='PROJECTION_LIMIT'?'繞路搜尋已達上限，請重試；原路線仍可查看。':d.result.error==='NO_CONDITION_DETOUR'?'目前沒有找到繞過這個紀錄的路線，原路線仍可查看。':'資料暫時不可用，原路線仍可查看。'});
    else {onSnapshot(snapshot);finish({status:'ready',route:d.result});}
   }else if(d.type==='error')finish({status:'error',message:'路網資料暫時無法讀取。'});
  };
  current.postMessage({type:'init',url});
 }
 return {start,cancel};
}
