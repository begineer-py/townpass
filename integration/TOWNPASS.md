# 台北通微服務串接

1. `npm run build`，將 `dist/` 佈署到可供手機存取的 HTTPS 網址。
2. 在台北通的 `MyServiceItemId` 與 `MyServiceIdExt` 新增「好好走」入口，destinationUrl 指向該網址。
3. `townpass-entry.patch` 是針對官方 Flutter 框架的最小整合 patch，修改服務清單與預設釘選。先於 Flutter checkout 執行 `git apply --check <patch完整路徑>`，確認適用後再 `git apply`。
4. 執行 Flutter 時帶入 `--dart-define=FRIENDLY_PATH_URL=https://你的網頁網址/`。未指定時預設 Android 模擬器開發網址 `http://10.0.2.2:5173/`；實機請使用 HTTPS 部署網址。

## 原生橋接

網頁僅在使用者點選定位時送出：

```json
{ "name": "location", "data": null }
```

接收 `flutterObject` 的 `message` 事件，檢查 `name`、有限數值的 latitude/longitude；15 秒逾時顯示手動選點替代。普通瀏覽器採 Geolocation。未請求 userinfo/deviceinfo，無須台北通會員。

正式宿主應只對核准的服務 origin 注入橋接，並驗證 sourceOrigin、isMainFrame 和 command capability。這個網站本身無法替代宿主端的安全檢查。

## 驗收

- Android / iOS 各測 WebView 定位成功、拒絕與逾時。
- 從服務入口進入，縮放拖曳不與 App 手勢衝突。
- 系統返回與頁面 dialog 關閉行為。
- VoiceOver / TalkBack、系統大字、橫向與低階裝置。
- HTTPS、子路徑部署、gzip 回應有無 Content-Encoding 皆可讀取。
- 目前已做桌面瀏覽器／手機尺寸檢查；尚未宣稱真機整合通過。
