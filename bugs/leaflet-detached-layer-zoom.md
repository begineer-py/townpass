# 切換底圖後縮放導致地圖崩潰

## 現象
使用者回報 Leaflet `_resetGrid` 讀取 null 的 `options`，及 `_resetView` 讀取 null 的 `getCenter`，React 的 MapView 隨之崩潰。Vite 的 Back-Forward Cache WebSocket 訊息是開發伺服器連線狀態，與此例外分開處理。

## 原因
`src/MapView.jsx` 在移除底圖前呼叫 `layer.off()`。Leaflet 的 `Layer._layerAdd` 以一次性的 `remove` 監聽器解除地圖事件；預先清空圖層監聽器會使舊圖層仍收到縮放事件，而該圖層 `_map` 已是 null。

## 修正與驗證
直接呼叫 `layer.remove()`，讓 Leaflet 自行解除地圖事件；卸載時清除 map ref，延後的路線 fit 會先確認地圖仍有效。瀏覽器實測切換底圖及隱藏圖標、縮放、規劃路線與再次切換後縮放，路線仍顯示，瀏覽器 error log 為空。完整測試與建置通過。
