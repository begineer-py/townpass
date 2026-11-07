# 前端設計

遵循 `.agents/skills/design` 與 `townpass-web-design`：手機優先、16px頁面邊距、白色內容區、灰底輸入欄、10px按鈕圓角。只有400與600字重，字色來自TPColors，字級來自TPTextStyles。

首頁不重複繪製台北通AppBar，使用功能選單開啟內容。瀏覽器頁籤標題維持好好走。主按鈕使用primary500；為閱讀對比採primary950文字，高對比模式改primary800配白字。

- App.jsx：功能狀態、查詢、面板與對話框。
- MapView.jsx：底圖、標記、縮放與手勢。
- VoiceSearch.jsx：點按後啟動語音，關閉時停止。
- style.css／tp-tokens.css：元件樣式與共用色票。
- route-worker.js：資料載入及路線幾何驗證。

手機操作地圖時面板向下收；把手可展開。減少動態效果時不播放動畫。地圖控制保留44px點按範圍。
