
# 好好走 · 臺北友善出行

可嵌入台北通 WebView 的手機網頁微服務。搜尋地點、地址或直接點選地圖上的起終點，查看公開路網的路線參考、捷運電梯出口、無障礙廁所、休息座椅、飲水與附近設施。

## 開始使用

```sh
npm ci
npm run dev
```

開啟 `http://localhost:5173/`。同網路手機可開發機的區網 IP 與 5173 port。定位使用瀏覽器 Geolocation API；正式環境需 HTTPS，並由使用者授權。頁面不讀取台北通會員或身分資料。

正式環境部署方式請參閱 [Vercel 部署說明](DEPLOYMENT.md)。

```sh
npm test
node scripts/smoke_routes.mjs
npm run build
npm run preview
```

`dist/` 可部署到一般靜態 HTTPS 主機，支援子路徑；保留 data 子目錄。不是只有畫面的示範：路線由本機 Web Worker 計算，不呼叫商用地圖、雲端 LLM 或付費導航 API。

## 功能

- 全臺北及邊界周邊的公開路網、地名和設施資料；不是限制單一示範區。
- 兩點搜尋、地圖選點、交換起終點、定位。
- 地圖平移、觸控縮放、明確放大縮小按鈕、設施聚合與清單替代操作。
- 已知階梯、節點障礙、寬度、坡度條件篩選；均衡、偏好平緩、減少過街。
- 路線繪製、轉向與分段預覽、缺漏比例、起終點銜接距離。
- 捷運電梯／坡道出口座標、車站文字位置、異常公告、白話保養日期。
- 無障礙廁所、一般公廁資料區分；休息、飲水、公園、店家、公車、停車與醫療點位。
- 按路名懶載入地址索引，不把數十萬筆地址一次交給主執行緒。
- 本機收藏、儲存行程、文字分享、可停止的路線朗讀、大字與高對比模式。
- 正式 build 提供同源 App shell 與已讀取資料的離線快取；不預抓或離線打包 OSM 公共圖磚。

## 真實限制

這是**公開路網上的通行參考，不是經逐段現勘認證的無障礙導航**。

- 大部分 OSM 路段缺少完整坡度／淨寬；缺值保留未知。`knownOnly` 開啟時，缺少這些資料的路段會被排除。
- 一般道路線形不是人行道連續性證明；介面顯示一般道路比例及未知資訊。
- 路網只依原始 OSM 連通關係連接，不把隔街、隔牆的近鄰直接連線。端點不再跳過最近的不可用節點；偏移最多 5 公尺，銜接線必須有完整官方面覆蓋且過街依據通過。尚未進行樓層入口的完整驗證。
- 路線規劃尚未套用電梯臨時故障、施工封閉為硬限制；施工是沿線資料提醒。這些資料目前是同步時的快照，沒有自動背景排程。
- 輪行臺北部分 width 實際值和文件單位疑義未解，保留 raw，不拿來假裝量測精準。
- 無障礙廁所 API kind 9 本次空回應，以環保局公廁資料中無障礙廁座數大於零者替代。
- 大型設施的中心點不等於可進入的入口。優先選擇明確出口或入口點位。
- 路線朗讀是預覽，不是即時盲人導航；未做實際螢幕閱讀器或外出使用者驗證。
- 尚未在台北通服務目錄上架，iOS／Android WebView 真機版面與定位權限仍需由宿主 App 驗收。

## 更新資料

Python 3.10+，先建立獨立環境：

```sh
python -m venv .venv
# Windows
.venv/Scripts/python -m pip install -r scripts/requirements.txt
.venv/Scripts/python scripts/sync_data.py --refresh
.venv/Scripts/python scripts/enrich_data.py --refresh
```

原始來源保存於忽略版本控制的 `data/raw/`。不帶 `--refresh` 會使用既有原檔，方便重現與斷點續作。地址與路網來源為 Geofabrik Taiwan OSM PBF：

```sh
curl -L --fail --retry 3 -C - -o data/raw/taiwan.osm.pbf https://download.geofabrik.de/asia/taiwan-latest.osm.pbf
.venv/Scripts/python scripts/build_graph.py
.venv/Scripts/python scripts/pack_data.py
.venv/Scripts/python scripts/integrate_official_paths.py
npm test
npm run build
```

維修預排 resource ID 隨月份變更，更新前應核對資料集最新資源。不要把 manifest 的取得時間稱作現場調查時間。更新來源後重新 build，Service Worker 的版本會跟著資料變更。

## 台北通嵌入

這是獨立的 HTTPS 網頁微服務。台北通只需將部署後網址加入服務目錄並以 WebView 開啟；本專案不需改動或編譯 Flutter App。詳見[嵌入說明](integration/TOWNPASS.md)。

## 資料與授權

- 路網、地名和補充設施：© [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)，ODbL。原始抽取：[Geofabrik Taiwan](https://download.geofabrik.de/asia/taiwan.html)。由 OSM 產生的 graph、places、address-index、addresses 資料依 ODbL 提供；不要將資料授權和程式碼授權混為一談。
- 臺北市資料：各筆保留 sourceId，`public/data/sources.json.gz` 保留官方來源與取得紀錄。依各資料集與政府資料開放授權條款署名。
- OSM 標準圖磚僅供使用者正在查看的範圍互動載入，遵循快取與署名政策；大量正式流量請改用自管或有合適服務條件的圖磚主機。
- 程式碼採 AGPL-3.0-or-later，依賴元件各自保留授權。

本專案沒有對市府系統送出通報；正式台北通上架與真機整合狀態請參閱 VALIDATION.md。

## 底圖切換

提供一般地圖、航照、航照加路名三種底圖。航照採國土測繪中心 PHOTO2 WMTS，路名採 EMAP2 透明電子地圖，並保留來源署名。影像並非即時衛星畫面，拍攝時間依地區不同。僅請求使用者目前觀看的圖磚，不批次下載或打包影像。

介接來源：https://maps.nlsc.gov.tw/S09SOA/pro/Wmts_ajax_main.jsp

預設以全畫面顯示地圖。從「選單」可開啟路線規劃、設施查詢、捷運出口與收藏，也可切換底圖或顯示設施圖層。「通行與閱讀設定」可選擇偏好平緩、減少過街等路線偏好。

## 官方人行空間整合（2026-11-07）

`integrate_official_paths.py` 將輪行臺北 API 11/12/13 的閉合多邊形，以 TWD97 公尺座標與每一條路網邊的完整幾何做精確交集。不加緩衝區、不依近鄰虛構連線。來源共 20,271 筆，20,242 筆可用，29 筆因未閉合／無效排除。產生 `official-paths.json.gz` 與逐邊的 coverage/featureIds。

路由預設提高未重疊路段的代價，優先考慮官方人行空間。路網版本 v2 已改為固定硬限制，不能以偏好關閉；全段至少 99.99% 圖資重疊且最大缺口不超過 5 公分。這是幾何證據，不是輪椅通行認證。路線結果分別顯示官方幾何重疊比例與寬度／坡度缺漏比例。

三類 API 的 slope 本次皆為缺值；人行道 width 有 15,291 個正值，但文件的公分單位與數值尺度存在疑義，未擅自轉換為公尺套用。原先「有 API 卻沒拿來評估路段」的缺漏已補上；完整無障礙判定仍待單位、出入口與路況驗證。

注意：重新執行 pack_data 後，必須再次執行 integrate_official_paths，才會保留官方幾何註記。

## 人行路線硬限制 v2

- 只接受獨立標示的 footway/path/pedestrian/corridor；車道類型、階梯、未確認的橋隧／非地面樓層不能藉由使用者選項放行。
- 車道交會遮罩直接來自原始 OSM PBF 的完整車道類型，不沿用已過濾行人 graph，以涵蓋 motorway/trunk、foot=no/private 道路。
- 每條邊須有 schema 2、完整官方多邊形證據、車道交會驗證。過街還需官方行穿線；幾何修復後的非面碎片不用來證明可通行。
- 起終點取原始最近節點後才檢查，不能跳過車道點去吸附另一側。5公尺內的連接線也必須完全落在官方面聯集，與車道交會時須有行穿線依據。沒有證據就回 NO_CONNECTION。
- 無連續路線就回 NO_ROUTE，不以普通道路或直線補接。已知寬度／坡度限制仍套用，缺值不代表已驗證安全。
- 舊收藏只帶入起終點，不能直接重放舊路線；改點、換偏好、重算都會停止舊朗讀。
- build 前與 worker 初始化都驗證資料契約；漏跑官方整合不能繼續使用舊資料。
- `node scripts/audit-pedestrian-routing.mjs` 對有依據的真實人行連通分量做正向測試，確認並非一律拒絕；回傳路線車道比例為0。這仍不等於現場坡度、施工與電梯狀況皆已查核。

## 設計token

`src/tp-tokens.css`、`src/tp-colors.mjs` 在網頁端定義台北通風格的色彩與字級，前端不依賴 Flutter 程式碼。正文使用 14px／400、主要控制項 16px、區塊標題 18px／600。系統字型優先 PingFang TC，Windows fallback 微軟正黑體。
