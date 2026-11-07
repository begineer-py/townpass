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
