export function nearbyReplacement(candidate,original){
 const prior=original?.nearbyOriginal,name=String(prior?.name||original?.name||'原地點');
 const coordinates=prior?.coordinates||[original.lat,original.lon],p=candidate.point;
 const distance=Math.round(Math.hypot((p.lat-coordinates[0])*111195,(p.lon-coordinates[1])*100700));
 return {...p,name:p.kind==='metro-elevator'?p.name:p.nearbyNetwork==='shared'?'附近人車共行路網位置':'附近人行路網位置',nearbyOriginal:{name,coordinates,straightMetres:distance}};
}
export function nearbyWarnings(start,end){
 return [[start,'start'],[end,'end']].filter(([p])=>p?.nearbyOriginal).map(([p,position])=>{
  const o=p.nearbyOriginal,side=position==='start'?'起點':'目的地';
  const endpoint=position==='start'?'路線不從原地點出發':'路線尚未抵達原地點';
  return `${side}改為附近${p.kind==='metro-elevator'?'電梯出口':p.nearbyNetwork==='shared'?'人車共行路網':'人行路網'}，距原選點約 ${o.straightMetres} 公尺；${endpoint}，銜接與樓層未確認。`;
 });
}
import {constructionFresh} from './construction.mjs';
import {ROUTING_POLICY} from './routing.mjs';

export function verifiedNearbyChoice(choice,start,end,snapshot){
 const route=choice?.route;
 if(!start||!end||!constructionFresh(snapshot)||route?.error||route?.policyVersion!==ROUTING_POLICY||route?.geometryVerification!=='pedestrian-network-v1'||route?.construction?.sourceUpdatedAt!==snapshot.sourceUpdatedAt||route?.construction?.blocked?.length)return null;
 const resolved=(replacement,original,actual)=>{
  if(!replacement)return actual||original;
  const p=replacement.point;
  if(!p||!actual||p.lat!==actual.lat||p.lon!==actual.lon)return null;
  return nearbyReplacement({...replacement,point:actual},original);
 };
 const resolvedStart=resolved(choice.start,start,route.resolvedStart),resolvedEnd=resolved(choice.end,end,route.resolvedEnd);
 if(!resolvedStart||!resolvedEnd||(!choice.start&&!choice.end))return null;
 return {start:resolvedStart,end:resolvedEnd,route:{...route,resolvedStart,resolvedEnd}};
}

// Automatic alternatives must keep the position returned by the device.
// A user can still explicitly choose a different nearby point.
export function preservesGpsOrigin(choice,start){
 return !!choice && (start?.originKind!=='gps' || (choice.start?.lat===start.lat && choice.start?.lon===start.lon));
}
