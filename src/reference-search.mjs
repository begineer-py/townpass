import {constructionFresh} from './construction.mjs';
import {ROUTING_POLICY,metres} from './routing.mjs';
import {referenceNavigationSteps} from './reference-navigation-steps.mjs';

// Uses the app's one serialized graph worker; cancelling synchronous work
// restarts that worker but never changes an already displayed route.
export function createReferenceSearch({fetchSnapshot,getLifecycle,onState,onSnapshot=()=>{},timeoutMs=45000}){
 let version=0,request=null,controller=null,timer=null;
 function cancel(notify=true){const old=request;request=null;version++;controller?.abort();controller=null;clearTimeout(timer);timer=null;if(old)old.lifecycle.cancelIfActive('reference-route',old.id);if(notify)onState({status:'idle'});}
 function finish(state){if(!request)return;request=null;version++;controller?.abort();controller=null;clearTimeout(timer);timer=null;onState(state);}
 function handleMessage(d){const r=request;if(!r||d?.type!=='reference-route'||d.id!==r.id)return false;
  const comparison=d.result;
  const validPoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=24.9&&p[0]<=25.3&&p[1]>=121.4&&p[1]<=121.8;
  const presentationMatches=route=>{
   const rebuilt=[];for(const segment of route.segments)for(const p of segment.coordinates)if(!rebuilt.length||metres(rebuilt.at(-1),p)>.000001)rebuilt.push(p);
   if(rebuilt.length!==route.coordinates.length||rebuilt.some((p,i)=>metres(p,route.coordinates[i])>.000001))return false;
   if(route.segments.some(s=>!Number.isFinite(s.distanceMetres)||s.distanceMetres<0||(s.kind==='osm'&&(typeof s.roadName!=='string'||s.roadName.length>200))))return false;
   const sum=route.segments.reduce((n,s)=>n+s.distanceMetres,0);
   if(Math.abs(sum-route.distanceMetres)>.000001||route.distance!==Math.round(sum))return false;
   const steps=referenceNavigationSteps(route.segments);
   return JSON.stringify(route.steps)===JSON.stringify(steps);
  };
  const validRoute=(route,hash)=>route?.kind==='official-passageway'&&route.verification==='official-source-screened-v1'&&route.navigationAllowed===true&&route.geometryVerification==null&&route.policyVersion===ROUTING_POLICY&&route.sourceHash===hash&&/^[a-f0-9]{64}$/i.test(hash||'')&&route.constructionSourceUpdatedAt===r.snapshot.sourceUpdatedAt&&route.construction?.sourceUpdatedAt===r.snapshot.sourceUpdatedAt&&Array.isArray(route.construction.blocked)&&!route.construction.blocked.length&&Number.isFinite(route.distanceMetres)&&route.distanceMetres>=0&&Array.isArray(route.coordinates)&&route.coordinates.length>=2&&route.coordinates.every(validPoint)&&metres(route.coordinates[0],[r.startPlace.lat,r.startPlace.lon])<=.01&&metres(route.coordinates.at(-1),[r.endPlace.lat,r.endPlace.lon])<=.01&&Array.isArray(route.steps)&&Array.isArray(route.segments)&&route.segments.length>0&&route.segments.every((s,i)=>Array.isArray(s.coordinates)&&s.coordinates.length>=2&&s.coordinates.every(validPoint)&&(!i||metres(route.segments[i-1].coordinates.at(-1),s.coordinates[0])<=.000001))&&metres(route.segments[0].coordinates[0],route.coordinates[0])<=.000001&&metres(route.segments.at(-1).coordinates.at(-1),route.coordinates.at(-1))<=.000001&&route.steps.every(s=>typeof s.name==='string'&&typeof s.turn==='string'&&Number.isFinite(s.lat)&&Number.isFinite(s.lon)&&Number.isFinite(s.distance)&&s.distance>=0)&&presentationMatches(route);
  const hash=comparison?.sourceHash;const candidates=Array.isArray(comparison?.candidates)?comparison.candidates.filter(c=>typeof c?.id==='string'&&validRoute(c.route,hash)):[];
  const result=comparison?.kind==='official-passageway-comparison'?candidates.find(c=>c.id===comparison.recommendedCandidateId)?.route:comparison;
  if(!constructionFresh(r.snapshot))finish({status:'error',message:'施工資料已過期，請重試。'});
  else if(comparison?.error)finish({status:'error',message:comparison.error==='PROVISIONAL_SEARCH_LIMIT'?'附近路線搜尋已達上限。':comparison.error==='CONSTRUCTION_UNAVAILABLE'?'施工資料已過期，請重試。':comparison.error==='OFFICIAL_ENTRY_UNVERIFIED'?'起終點的通行資料無法確認。':'附近沒有找到可用路線。'});
  else if(!validRoute(result,comparison?.kind==='official-passageway-comparison'?hash:result?.sourceHash))finish({status:'error',message:'路線資料未通過檢查。'});
  else {onSnapshot(r.snapshot);finish({status:'ready',route:result,candidates,comparisonStatus:comparison.status,sourceHash:result.sourceHash,startPlace:r.startPlace,endPlace:r.endPlace,constructionFetchedAt:r.snapshot.fetchedAt,constructionSourceUpdatedAt:r.snapshot.sourceUpdatedAt});}
  return true;
 }
 function handleDropped(message){if(request&&message?.type==='reference-route'&&message.id===request.id){finish({status:'error',message:'路線搜尋已中斷，請重試。'});return true;}return false;}
 async function start({startPlace,endPlace,options,online,offlineSnapshot,requestTimeoutMs}){
  cancel(false);const id=version;onState({status:'loading'});const abort=new AbortController();controller=abort;
  const fail=message=>{if(id!==version)return;version++;abort.abort();controller=null;clearTimeout(timer);timer=null;onState({status:'error',message});};
  if(![startPlace?.lat,startPlace?.lon,endPlace?.lat,endPlace?.lon].every(Number.isFinite)){fail('請先選擇起點與目的地。');return;}
  const limit=Number.isFinite(requestTimeoutMs)&&requestTimeoutMs>0?Math.min(timeoutMs,requestTimeoutMs):timeoutMs;
  timer=setTimeout(()=>{if(id!==version)return;const old=request;request=null;fail('路線搜尋逾時，請重試。');old?.lifecycle.cancelIfActive('reference-route',id);},limit);
  let snapshot;try{snapshot=online?await fetchSnapshot(abort.signal):offlineSnapshot;}catch{fail('施工資料暫時不可用。');return;}
  if(id!==version)return;if(!constructionFresh(snapshot)){fail('施工資料已過期，請重試。');return;}
  const lifecycle=getLifecycle();if(!lifecycle){fail('路線資料暫時不可用。');return;}
  request={id,lifecycle,snapshot,startPlace,endPlace};
  if(!lifecycle.postMessage({type:'reference-route',id,start:[startPlace.lat,startPlace.lon],end:[endPlace.lat,endPlace.lon],startPlace,endPlace,options,construction:snapshot})){request=null;fail('目前正在規劃路線，請稍後再試。');}
 }
 return {start,cancel,handleMessage,handleDropped};
}
