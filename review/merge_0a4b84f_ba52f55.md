# 本次合併對照

## 「設計簡單資料庫 紀錄曾經用戶路線 自動補全」

已合併 `src/local-database.js` 的 IndexedDB profiles／trips；`src/App.jsx` 從帳戶對應的本機鍵載入行程並用於搜尋。

```js
const [stored, storedTrips] = await Promise.all([
  loadProfile(key),
  loadTrips(key),
]);
```

## 「使用者第一次使用時 詢問類型 紀錄到資料庫」

已合併主要出行方式對話框及儲存操作。

```js
setTravelProfile(id);
void saveProfile(profileStorageKey, id);
updatePrefs(profile.preferences);
```

## 「自動避開施工區域」

合併後保留 `src/route-worker.js` 的施工時效檢查，順路停靠分段通過幾何與施工檢查後才合併。

```js
const a=leg(data.start,data.via),b=a.error?a:leg(data.via,data.end);
result=combineRoutes(a,b,data.viaName);
```

合併來源：main `0a4b84f`、fix/pedestrian-routes `ba52f55`。99項測試與正式建置通過；瀏覽器已載入主要出行方式對話框，未自動代選個人類型或授權定位。
