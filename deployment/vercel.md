# Vercel 部署

1. 在 Vercel 匯入本儲存庫，Root Directory 留在專案根目錄。
2. Framework 選 Vite；Install：`npm ci`；Build：`npm run build`；Output：`dist`。
3. 使用 `codex/accessibility-map-dev` 的 Preview 驗證，Production 分支由團隊決定。
4. 保留根目錄 `api/accessible-route.js` 與 `api/construction.js`，Vercel 會建立 Node 函式。不能只上傳 dist。
5. 確認網站、`/data/graph.json.gz` 及 `POST /api/accessible-route` 正常；GET API 回405是預期行為。
6. 將 HTTPS 網址交給台北通服務管理者設定 WebView 入口；本儲存庫不修改 Flutter。

API 固定轉接市府路線查詢，不需要 API 金鑰。前端只傳兩點座標，驗證在瀏覽器 Worker 執行。

本機：`npm ci`、`npm run build`、`npm run preview`，開啟 http://localhost:4173/ 。

部署後檢查手機定位、麥克風權限、一般地圖／航照、語音與路線錯誤提示。主機應設定流量限制及位置日誌保存政策。


# 台北通嵌入

本專案是獨立的 HTTPS 網頁微服務。台北通只需將部署後的服務網址加入服務入口，並以 WebView 開啟；本專案不需要修改或編譯 Flutter App，也不需要設定 Flutter build 參數。

## 串接步驟

1. 依照[部署說明](vercel.md)將網站部署至 Vercel。
2. 確認正式網址使用 HTTPS，且首頁與地圖資料都能由手機瀏覽器開啟。
3. 將正式網址交給台北通服務維運者，加入服務目錄並設定為此微服務的開啟網址。
4. 由台北通 App 開啟該網址，確認頁面能在 WebView 內正常顯示。

服務網址由部署平台管理；切換 Vercel 網域或自訂網域時，請同步更新台北通服務目錄中的網址。

## 定位

定位使用標準瀏覽器 Geolocation API，只在使用者點選定位功能時提出權限要求。不讀取台北通會員、身分或裝置資料，也不呼叫 Flutter JavaScript bridge。Vercel 提供 HTTPS；若 WebView 未授權網頁定位，使用者仍可搜尋地點或直接在地圖上選點。

## 上線驗收

- 從台北通服務入口開啟正式 HTTPS 網址。
- 首頁、地圖圖磚和地圖資料載入正常。
- 定位允許、拒絕與逾時時都能繼續以搜尋或地圖選點操作。
- iOS 與 Android 的 WebView 版面、返回操作、系統字級和輔助使用功能均需在宿主 App 中另行驗收。

目前尚未宣稱已在台北通正式服務目錄上架，也尚未完成 iOS／Android 真機驗收。
