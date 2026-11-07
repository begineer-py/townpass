export function nearbyReplacement(candidate,original){
 const prior=original?.nearbyOriginal,name=String(prior?.name||original?.name||'原地點');
 const coordinates=prior?.coordinates||[original.lat,original.lon],p=candidate.point;
 const distance=Math.round(Math.hypot((p.lat-coordinates[0])*111195,(p.lon-coordinates[1])*100700));
 return {...p,name:'附近人行路網位置',nearbyOriginal:{name,coordinates,straightMetres:distance}};
}
export function nearbyWarnings(start,end){
 return [[start,'start'],[end,'end']].filter(([p])=>p?.nearbyOriginal).map(([p,position])=>{
  const o=p.nearbyOriginal,side=position==='start'?'起點':'目的地';
  const endpoint=position==='start'?'路線不從原地點出發':'路線尚未抵達原地點';
  return `${side}改為距「${o.name}」直線約 ${o.straightMetres} 公尺的人行路網位置；${endpoint}，兩者之間的通行與樓層未確認。`;
 });
}
