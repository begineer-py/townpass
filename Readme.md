# 好好走

臺北通 WebView 友善出行服務：地點搜尋、路線規劃、捷運電梯、無障礙設施、語音及收藏。

## 本機啟動

```sh
npm ci
npm run dev
```

開啟 http://localhost:5173/ 。正式建置預覽：

```sh
npm test
npm run build
npm run preview
```

預覽網址：http://localhost:4173/ 。

## 團隊文件

- [專案導覽](handbook/intro.md)
- [目前狀態](handbook/current.md)
- [前端設計](handbook/fronted.md)
- [資料與路由](handbook/routing-reference.md)
- [驗證紀錄](handbook/validation.md)
- [Vercel與台北通部署](deployment/vercel.md)

開發分支：`codex/accessibility-map-dev`。後續方向由團隊維護 `/plan`。
