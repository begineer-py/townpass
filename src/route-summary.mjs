// Descriptions are derived from mapped route data, not an accessibility claim.
const finite=value=>Number.isFinite(value)&&value>=0;
const amount=n=>n>=1000?`${(n/1000).toFixed(1)} 公里`:`${Math.round(n)} 公尺`;
export function routeSummaryMetrics(candidate,source='local'){
 const route=candidate?.route, data=source==='reference'?candidate?.coverage:candidate?.metrics;
 const distance=source==='reference'?route?.distanceMetres:data?.distanceMetres;
 const sidewalk=source==='reference'?data?.generalSidewalkMetres:finite(data?.explicitSidewalkMetres)?data.explicitSidewalkMetres+(finite(data?.otherPedestrianMetres)?data.otherPedestrianMetres:0):null;
 const shared=data?.sharedMetres,unknown=data?.unknownMetres,approach=data?.estimatedMetres??data?.estimatedApproachMetres;
 const conditions=route?.officialConditions;
 const records=conditions?.status==='available'&&Array.isArray(conditions.points)?conditions.points.length:null;
 const approximateCrossing=Array.isArray(route?.segments)&&route.segments.some(segment=>segment.approximateCrossing===true);
 return {distance,sidewalk,shared,unknown,approach,records,approximateCrossing};
}
export function describeRouteChoices(items){
 const metrics=items.map(item=>routeSummaryMetrics(item.candidate,item.source));
 const distances=metrics.map(m=>m.distance).filter(finite);
 const shortest=distances.length===metrics.length&&distances.length>1?Math.min(...distances):null;
 const sidewalkShares=metrics.map(m=>finite(m.sidewalk)&&finite(m.distance)&&m.distance>0?m.sidewalk/m.distance:null);
 const canCompareSidewalk=sidewalkShares.length>1&&sidewalkShares.every(Number.isFinite);
 const sharedShares=metrics.map(m=>finite(m.shared)&&finite(m.distance)&&m.distance>0?m.shared/m.distance:null);
 const canCompareShared=sharedShares.length>1&&sharedShares.every(Number.isFinite);
 return metrics.map((m,i)=>{
  const strengths=[];
  if(canCompareSidewalk&&sidewalkShares[i]>=Math.max(...sidewalkShares)-1e-9&&sidewalkShares[i]-Math.min(...sidewalkShares)>=.1)strengths.push('人行道較多');
  else if(canCompareShared&&sharedShares[i]<=Math.min(...sharedShares)+1e-9&&Math.max(...sharedShares)-sharedShares[i]>=.1)strengths.push('人車共行較少');
  if(shortest!==null&&m.distance<=shortest+.5&&Math.max(...distances)-shortest>=Math.max(20,shortest*.05))strengths.push('路程較短');
  if(!strengths.length&&finite(m.sidewalk)&&m.sidewalk>1)strengths.push(`人行道約 ${amount(m.sidewalk)}`);
  const concerns=[];
  if(m.approximateCrossing)concerns.push('過街邊界未確認');
  if(m.records>0)concerns.push(`附近有 ${m.records} 筆通行問題紀錄`);
  if(finite(m.shared)&&m.shared>1)concerns.push(`人車共行約 ${amount(m.shared)}`);
  else if(finite(m.shared)&&m.shared>0)concerns.push('有短段人車共行');
  if(shortest!==null&&m.distance-shortest>=Math.max(20,shortest*.05))concerns.push(`比最短多走約 ${amount(m.distance-shortest)}`);
  if(!finite(m.unknown)||m.unknown>0||m.records===null)concerns.push('部分路況資料不足');
  else if(finite(m.approach)&&m.approach>1)concerns.push('起終點銜接待確認');
  const sidewalkPercent=finite(m.sidewalk)&&finite(m.distance)&&m.distance>0&&m.sidewalk<=m.distance*1.01?Math.min(100,Math.round(m.sidewalk/m.distance*100)):null;
  return {sidewalkPercent,strength:strengths.slice(0,2).join('、')||(canCompareSidewalk&&canCompareShared?'尚無明顯優點':'資料不足，無法比較'),concern:concerns.slice(0,2).join('；')||'實際路況請留意現場',hasUnknown:!finite(m.unknown)||m.unknown>0||m.records===null};
 });
}
