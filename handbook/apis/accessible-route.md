# POST /api/accessible-route

輸入JSON：`{"points":[{"lat":25.047,"lng":121.517},{"lat":25.052,"lng":121.521}]}`。

只接受兩個有限數字座標，查詢範圍外回422；格式錯誤400，方法錯誤405，上游失敗502，逾時504。

回應是候選路線。前端Worker仍需檢查人行空間、行穿線及入口，不能直接把HTTP 200當成可通行。

上游固定為臺北市無障礙通行路線平臺。不得轉傳身分、cookies或任意目的網址。位置請求不快取；上游內部檔案路徑不回傳前端。

本機Vite與Vercel共用api/accessible-route.js。市府端回應欄位與服務狀態可能變動，測試見tests/route-api.test.mjs及tests/route-request.test.mjs。
