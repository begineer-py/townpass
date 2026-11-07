# 好好走服務手冊

## 用途

好好走是臺北友善出行地圖，提供地點搜尋、公開路網路線參考、捷運出口與無障礙設施查詢。網站以 WebView 微服務方式提供，不包含 Flutter App 程式碼。

## 常用入口

- [目前狀態](current.md)：已完成項目與尚待驗收事項。
- [前端結構](fronted.md)：頁面、地圖、路線與本機資料位置。
- [資料端點](apis/data.md)：部署網站提供的靜態資料檔。
- [Vercel 部署](../deployment/README.md)：建置與上線步驟。
- [台北通整合](../integration/TOWNPASS.md)：WebView、bridge 與定位說明。

## 本機啟動

```sh
npm ci
npm run dev
```

在瀏覽器開啟 `http://localhost:5173/`。資料同步與路網建置命令列於根目錄 `package.json`。
