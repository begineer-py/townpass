# 好好走・臺北友善出行

可在台北通 WebView 開啟的手機網頁服務：地點搜尋、無障礙路線規劃、捷運電梯出口、附近無障礙設施、語音與收藏。

## 本機啟動

```sh
npm ci
npm run dev
```

開啟 `http://localhost:5173/`。定位需使用者授權；正式環境需 HTTPS。

用手機連區網 IP 測試定位時，瀏覽器只允許 HTTPS 網址定位，請改用：

```sh
npm run dev:https
```

開啟終端機顯示的 `https://192.168.x.x:5173/`。這是自簽憑證，第一次開啟要選「繼續前往」。

## 功能

- 地點、地址、捷運站搜尋；最近行程可作為搜尋建議。
- 依主要出行方式調整路線條件，或指定寬度、坡度與路線偏好。
- 路線須通過人行範圍、過街、入口與施工檢查才顯示；找不到時提供附近捷運電梯出口。
- 查詢捷運電梯、無障礙廁所、休息與飲水設施。
- 語音輸入與朗讀、色覺友善與高對比顯示。
- 收藏與行程保存在本機瀏覽器資料庫。

路線依公開圖資規劃，缺少寬度或坡度資料時會標示未知。不是現場通行認證。

## 文件

- [Vercel 部署](deployment/README.md)
- [台北通 WebView 整合](integration/TOWNPASS.md)
- [服務與維護手冊](handbook/intro.md)
- [目前狀態](handbook/current.md)
- [前端設計](handbook/fronted.md)
- [資料與路由](handbook/routing-reference.md)
- [資料端點](handbook/apis/data.md)
- [驗證紀錄](handbook/validation.md)

## 授權

程式碼採 AGPL-3.0-or-later。地圖與資料來源及其授權依各資料集規定，詳見應用程式內的「資料來源」。
