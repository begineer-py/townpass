# v2 審查

## 需求「使用者只需要看到夠用的資訊,不要無關標語,一個搜尋框預設界面」

已完成：進站不開啟規劃面板，地圖上只有一個搜尋框。規劃頁沒有一句話輸入、出行身分與示範路線。

```jsx
const [tab, setTab] = useState(null);
```

```jsx
{!tab && <button className="map-search-button" onClick={()=>openSearch("explore")} aria-label="搜尋地點、地址或路名"><Search size={20}/><span>搜尋地點、地址或路名</span></button>}
```

## 需求「Agree1999MessageHandler」

已完成：路障回報送出 `1999agree`，名稱與宿主處理器一致。

```js
else await sendToTownPass("1999agree", true);
```

```js
const HOOKS = new Set(["userinfo", "location", "phone_call", "launch_map", "1999agree"]);
```

## 需求「可以通過LocationMessageHandler查詢用戶位置」

已完成：原生定位例外或無效座標時，改用瀏覽器定位。

```js
let bridged;try{bridged=await sendToTownPass('location');}catch{}
if(bridged){try{return point(bridged,'townpass');}catch{}}
```

## 需求「可規劃路線」

已完成：車站名稱先對到同站電梯出口，再計算出口之間的人行路線。

```js
const found=facilities.filter(p=>p.kind==='metro-elevator'&&key(p.station)===key(place.name));
return found.length?found.slice(0,4):[place];
```

## 需求「自動避開施工區域」

已完成：接點檢查與路線驗證使用同一組行穿線資料，施工封閉的邊不進入結果。

```js
roadConnectorChecker(
  graph.roadGeometries,
  graph.supplementalEvidence
    ? officialGeometryEvidence(graph).crossings
    : graph.officialCrossingAreas,
)
```

## 需求「官方人行道圖資覆蓋路段權重×1.0、OSM獨立人行道×1.8、銜接路段×3.5」

已完成：三種路段各自使用對應倍率。

```js
export const ROUTE_TIERS = Object.freeze({
  official:{factor:1,color:'#15803D',label:'官方圖資覆蓋',dash:undefined},
  osm:{factor:1.8,color:'#1D4ED8',label:'OSM 人行路段',dash:'9 4'},
  connector:{factor:3.5,color:'#AE501F',label:'入口銜接',dash:'4 6'},
});
```

## 需求「起終點吸附距離放寬至50m」

已完成：吸附半徑 50 公尺，並投影到既有人行線段。

```js
export const SNAP_METRES = 50;
```

## 需求「設計簡單資料庫 紀錄曾經用戶路線 自動補全」

已完成：行程依帳戶鍵存在本機資料庫，搜尋時讀回。

```js
const [stored, storedTrips] = await Promise.all([
  loadProfile(key),
  loadTrips(key),
]);
```

## 需求「使用者第一次使用時 詢問類型 紀錄到資料庫」

已完成：尚未有出行方式時詢問一次，並寫入本機資料庫。

```js
setTravelProfile(id);
void saveProfile(profileStorageKey, id);
updatePrefs(profile.preferences);
```
