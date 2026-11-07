# 定位與車站接路對照

## 「可以通過LocationMessageHandler查詢用戶位置」

已修正橋接例外時備援中斷，原生回覆無效或拋錯後使用瀏覽器定位。

```js
let bridged;try{bridged=await sendToTownPass('location');}catch{}
if(bridged){try{return point(bridged,'townpass');}catch{}}
```

證據：tests/location.test.mjs涵蓋原生例外備援、onmessage回覆、拒絕權限、一般精度失敗再嘗試高精度及缺少精度不可假填0。

## 「可規劃路線」

車站名稱依官方捷運電梯資料取得同站出口，再計算出口之間的人行路線。

```js
const found=facilities.filter(p=>p.kind==='metro-elevator'&&key(p.station)===key(place.name));
return found.length?found.slice(0,4):[place];
```

證據：reports/station-routing-audit.json記錄台北車站R10至善導寺BL13成功、M4至出口3、1156公尺；瀏覽器同樣以車站名稱搜尋，顯示約1.2公里及19段指引。入口5／11公尺為位置估算，在畫面、虛線與朗讀中揭露，不是現勘認證。

## 「自動避開施工區域」

本機計算仍使用施工幾何排除邊，結果完整再比對。

```js
const start=[a.lat,a.lon],end=[b.lat,b.lon],prefs={...options,startPlace:a,endPlace:b,lineAllowed:checker.allowed};
const candidate=router(start,end,prefs);
```
