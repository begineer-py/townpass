# 好好走・臺北友善出行

可在台北通 WebView 開啟的手機網頁服務。搜尋地點、查看臺北路線參考、捷運電梯出口與附近無障礙設施。

## 本機啟動

```sh
npm ci
npm run dev
```

開啟 `http://localhost:5173/`。定位需使用者授權；正式環境需 HTTPS。

## 功能

- 地點、地址、捷運站搜尋；最近行程可作為搜尋建議。
- 依主要出行方式調整路線條件，或指定寬度、坡度與路線偏好。
- 查詢捷運電梯、無障礙廁所、休息與飲水設施。
- 收藏與行程保存在本機瀏覽器資料庫；路線由瀏覽器內的 Web Worker 計算。

路線依公開圖資規劃，缺少寬度或坡度資料時會標示未知。不是現場通行認證。

## 文件

- [Vercel 部署](deployment/README.md)
- [台北通 WebView 整合](integration/TOWNPASS.md)
- [服務與維護手冊](handbook/intro.md)
- [目前狀態](handbook/current.md)
- [資料端點](handbook/apis/data.md)

## 授權

程式碼採 AGPL-3.0-or-later。地圖與資料來源及其授權依各資料集規定，詳見應用程式內的「資料來源」。
