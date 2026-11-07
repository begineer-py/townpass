# 前端結構

## 主要檔案

- `src/App.jsx`：頁面流程、搜尋、使用者偏好、路線與設施面板。
- `src/MapView.jsx`：Leaflet 底圖、設施、路線、起終點與目前位置標記。
- `src/routing.mjs`、`src/route-worker.js`：路網檢查與瀏覽器端路線計算。
- `src/travel-profiles.js`：出行類型對應的預設寬度、坡度與路線偏好。
- `src/townpass-bridge.js`：台北通 `userinfo` 請求；僅回傳本機資料庫分區用的雜湊鍵。
- `src/local-database.js`：IndexedDB 出行類型與行程存取；不支援時回退至本機儲存空間。
- `src/data.js`、`src/address-search.js`：靜態資料載入與分片地址搜尋。
- `src/style.css`、`src/tp-tokens.css`：響應式版面與臺北通色彩字級 token。

## 使用者資料

出行類型與行程寫入瀏覽器 IndexedDB，無法使用時回退至本機儲存空間；路線偏好與收藏保存在本機儲存空間。WebView 回傳的帳號識別值只在記憶體中用來計算 SHA-256 雜湊鍵；姓名、電話與身分證字號不寫入儲存空間。路線與位置不會上傳至服務端。

## 顯示原則

首頁以地圖及單一搜尋入口為主。臺北通 WebView 已有原生頂列，頁面不再繪製重複標題列。出行類型可隨時調整；缺少寬度或坡度資料時保留未知狀態。
