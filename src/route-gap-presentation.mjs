// These points are context from reachable mapped components, not a route or
// evidence of an actual closure. Never generate a line between them.
export function routeGapPresentation(error,gap){
 if(error!=='NO_ROUTE')return null;
 const point=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
 if(gap?.status==='candidate'&&point(gap.startSide)&&point(gap.endSide)&&Number.isFinite(gap.straightMetres)&&gap.straightMetres>=0){
  return {status:'candidate',startSide:gap.startSide,endSide:gap.endSide,straightMetres:gap.straightMetres,
   message:`依其中一組候選入口，地圖標出起點側與目的地側可到達的路網位置，兩點直線相距約 ${Math.round(gap.straightMetres)} 公尺；目前未找到符合條件的連接，其他入口可能不同。標記不是通行路線，也不代表現場封閉；起終點銜接及實際路況仍需確認。`};
 }
 return {status:'unavailable',message:'目前無法定位兩側路網之間的連接缺口，可重新選擇出發地或目的地。'};
}
