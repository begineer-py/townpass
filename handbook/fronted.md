# 前端設計

以main的地圖介面與 `.agents/skills/townpass-web-design/SKILL.md` 為準。

- 地圖為背景。進站只有一個搜尋框；開始找路或看設施後，底部面板以 peek／half／full 三段高度切換。
- 主要功能使用底部分頁：找設施、規劃路線、捷運出口、收藏。圖層與定位用右上浮動工具。
- 主按鈕primary500底、白字、10px圓角、16px字級；按下primary600。次按鈕白底、primary500文字及邊框。
- 字體只用400／600字重，文字及色票取自TPTextStyles／TPColors；手機內容邊距16px。
- 高對比模式使用較深的同色系；色覺友善模式保留設施文字。語音可輸入、朗讀、調速及停止。
- 不重複繪製台北通AppBar；HTML title供宿主使用。
- 畫面保留距離、路線分段、施工位置／時間、電梯出口與保養時間；技術證據在本手冊及reports。

元件：App.jsx管理互動，MapView.jsx管理地圖，VoiceSearch.jsx管理收音，route-worker.js執行路線驗證及避讓。

資料與部署：[路由參考](routing-reference.md)、[Vercel](../deployment/vercel.md)。
