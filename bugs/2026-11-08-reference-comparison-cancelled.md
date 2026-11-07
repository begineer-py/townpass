# 已解析起終點後自動比較被取消

- 現象：路線先停留在基準結果，沒有進行預期的自動比較。
- 原因：Worker 回傳的已解析起終點是新物件。上次修改以 layout effect 啟動比較，但原本的起終點變更 passive effect 隨後取消該比較；已記錄的 request ID 又阻止重啟。
- 修復：把起終點失效和自動啟動比較集中在 `use-reference-comparison.js`，兩者依序在 layout effect 執行。既有候選路線驗證與評分維持不變。
- 瀏覽器回歸測試：`tests/fixtures/reference-order.html` 同次更新已解析起終點與路線，觀察到順序為取消舊請求、啟動比較，接著可完成並顯示測試結果；另以芝山附近公開測試定位至天母棒球場測試，系統回報找不到完整路線，因此該例無法驗證真實路線改善。
- 既有 `tests/sidewalk-route-choice.test.mjs` 檢查符合條件的已驗證候選路線會被選中；尚未以使用者的原始路線重現。
