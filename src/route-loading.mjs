export function routeLoadingMessage({preparing, comparing, nearby}) {
  if (preparing) return {title:'正在準備路線資料', detail:'正在載入規劃所需資料'};
  if (nearby) return {title:'正在尋找可連通路線', detail:'正在檢查附近路網'};
  if (comparing) return {title:'正在比較路線', detail:'正在比較距離與人行路段'};
  return {title:'正在尋找路線', detail:'正在檢查人行路段與施工資訊'};
}
