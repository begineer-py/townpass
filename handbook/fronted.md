# 前端結構

## 主要檔案

- `src/App.jsx`：頁面流程、搜尋、使用者偏好、路線與設施面板。
- `src/MapView.jsx`：Leaflet 底圖、設施、路線、起終點與目前位置標記。
- `src/VoiceSearch.jsx`：語音輸入。
- `src/routing.mjs`、`src/route-worker.js`：路網檢查、施工避讓與瀏覽器端路線驗證。
- `src/official-router.mjs`、`src/verify-official-route.mjs`、`src/alternative-routes.mjs`：市府路線查詢、幾何檢查與替代路線。
- `src/construction*.mjs`：施工資料取得與路由排除。
- `src/trip-extras.mjs`：地標起點與附近站點。
- `src/travel-profiles.js`：出行類型對應的預設寬度、坡度與路線偏好。
- `src/townpass-bridge.js`：台北通 bridge（`userinfo`、`location` 等）的共用呼叫；`userinfo` 只用來計算本機資料庫分區用的雜湊鍵。
- `src/local-database.js`：IndexedDB 出行類型與行程存取；不支援時回退至本機儲存空間。
- `src/data.js`、`src/address-search.js`：靜態資料載入與分片地址搜尋。
- `src/style.css`、`src/tp-tokens.css`：響應式版面與臺北通色彩字級 token。

## 畫面

以 `.agents/skills/townpass-web-design/SKILL.md` 為準。

- 地圖為背景，手機底部常駐搜尋面板；peek／half／full 三段高度，可拖曳或點把手切換。
- 主要功能使用底部分頁：找設施、規劃路線、捷運出口、收藏。圖層與定位用右上浮動工具。
- 字體只用 400／600 字重，文字及色票取自 TPTextStyles／TPColors；手機內容邊距 16px。
- 高對比模式使用較深的同色系；色覺友善模式保留設施文字。語音可輸入、朗讀、調速及停止。
- 不重複繪製台北通 AppBar；HTML title 供宿主使用。
- 畫面保留距離、路線分段、施工位置／時間、電梯出口與保養時間；技術證據在本手冊及 `/reports`。

## 使用者資料

出行類型與行程寫入瀏覽器 IndexedDB，無法使用時回退至本機儲存空間；路線偏好與收藏保存在本機儲存空間。WebView 回傳的帳號識別值只在記憶體中用來計算 SHA-256 雜湊鍵；姓名、電話與身分證字號不寫入儲存空間。位置只在查詢路線時以兩點座標送到 Vercel 函式。

資料與部署：[資料與路由](routing-reference.md)、[Vercel 部署](../deployment/README.md)。
