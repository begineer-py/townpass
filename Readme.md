# 好好走 · 臺北友善出行

可嵌入台北通 WebView 的手機網頁微服務。搜尋地點、地址或直接點選地圖上的起終點，查看公開路網的路線參考、捷運電梯出口、無障礙廁所、休息座椅、飲水與附近設施。

團隊導覽：[handbook/intro.md](handbook/intro.md)。部署設定：[deployment/README.md](deployment/README.md)。

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

部署需要同源 `/api/accessible-route` 轉接端點及 `dist/data` 靜態資料。線上路線由市府服務回傳，再由本機 Web Worker 驗證；離線路線由 Worker 計算。不呼叫商用導航、雲端 LLM 或付費導航 API。

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

`src/tp-tokens.css`、`src/tp-colors.mjs` 對應官方 `lib/util/tp_colors.dart` 的 TPColors；沒有另外定義字體色票。字級／字重對應 TPTextStyles，正文 bodyRegular 14/400、h3 16、titleSemiBold 18/600。文字與背景色在元件中組合，與原生 TPText 的使用方式一致。系統字型優先 PingFang TC，Windows fallback 微軟正黑體。

## 線上官方規劃來源（2026-11-07）

線上規劃改用原「無障礙通行路線平臺」公開前端使用的 navigation_waypoints 查詢介面。來源位於 https://tppano.gov.taipei/shortestAccessibleRoute/api/v1/navigation_waypoints/ ，只傳起終點lat/lng，不傳帳號或身障資料。此為公開網站目前使用的介面，未取得正式第三方介接SLA；上架前應確認介接、流量與維運條件。官方服務停止時顯示原因，離線仍使用原保守路網。

只接收success=true、used_alt=false、障礙計數為0且主通道segments完整的回應；插入障礙補線、超過25公分的未確認銜接或未知結構都拒絕。小型明確snapped圖資對齊誤差保留來源紀錄。選點離路網端點超過5公尺直接拒絕；5公尺內也須通過完整的人行多邊形與車道交會檢查。沒有可略過入口檢查的確認按鈕。不把API的snap_lines當成已驗證可走的連接路線。

官方介面不提供逐段淨寬/坡度及各偏好模式的比較；不假裝已套用這些條件。要求尺寸完整時拒絕缺值路線。線上模式不顯示離線專用的坡度/過街次數排序選項。資料不是即時現場認證。

早期僅檢查官方標記的樣本留在 reports/official-router-benchmark.json，不能當作目前可用路線驗收。新版完整幾何檢查結果見 reports/official-geometry-audit.json：原9組全部拒絕（7組人行圖資缺口、1組入口銜接、1組官方障礙替代路線）；另以大安實際路網端點重新向官方查詢，684公尺完整通過。拒絕表示缺少足夠圖資依據，不等於現場必然無路可走。

### 路線服務部署

市府端的 CORS 預檢未完整開放 POST JSON，因此瀏覽器透過本站 `POST /api/accessible-route` 查詢；Vite dev/preview 使用同一個 handler，Vercel 使用 `api/accessible-route.js` 函式。其他部署平台必須提供相同 Node API，不能只上傳 dist 到純靜態空間。轉接端只接受兩個臺北範圍座標、固定市府上游、20秒逾時，不轉傳 cookies/身分資料、不快取位置查詢，剔除上游內部路徑欄位。正式上線需依主機平台配置流量限制與位置日誌保存政策。


### 線上獨立幾何驗證

市府API回應僅是候選路線，不授予可使用的policyVersion。worker準備好圖資後，逐段檢查顯示線、指引分段與兩端銜接，必須完整落在人行空間多邊形聯集；碰到車道中心線必須有官方行穿線覆蓋，官方標為行穿線的整段也必須在行穿線多邊形內。檢查不使用抽樣或放大buffer補缺口。連零距離的道路上端點也不豁免。只有完整通過的結果才能顯示、朗讀、收藏或分享。

缺資料、初始化失敗、驗證逾時皆拒絕；切換端點會取消舊驗證，不讓舊結果覆蓋新行程。所有運算在worker執行，輸入位置不再多送給其他服務。

限制：車道交會遮罩是OSM中心線，並非全市每條車道的完整面；人行圖資也可能過時或偏移，因此這是依現有圖資排除已知衝突，仍不是現地安全認證。完整車道邊界、施工與現勘資料仍需補齊。


## 補充官方圖資（2026-11-07）

`.venv/Scripts/python scripts/supplement_paths.py` 將額外人行多邊形存入 graph.supplementalEvidence，線上驗證器與建置皆驗證來源及幾何格式。每次重建原graph或facilities後需重跑此步。`--refresh` 重新下載；原檔保留data/raw，不提交。來源及SHA256見 reports/supplemental-data-integration.json。

- 工務局人行道範圍JSON（2026-01-14）：15,055個修復後多邊形，保留孔洞，不加buffer。
- 交工處2026-10-30標線匯出實際混有多種標線，只使用專用行穿線檔可辨識的08/09/18/A8/A9/B8代碼、空狀態及01層級，取得18,731個多邊形；22,522筆未確認標線類型不作通行證據。專用2026-03-19行穿線壓縮檔保留供類別對照，不直接與較新匯出重複加入。
- 工務局斜坡道點位34,684筆，與既有坡道3公尺內去重後新增6,579筆，設施共46,612筆。點位只用於搜尋及設施資訊，不當成可跨街、銜接或寬坡度已驗證的證據。
- 新資料只增加線上幾何證據；離線可用路網仍3,777邊。本輪沒有重建全部OSM連通網路。

`audit_coverage_expansion.py` 比較相同公開路線加入前後的完整多邊形覆蓋；`audit-official-geometry.mjs` 繼續檢查完整路線及入口。萬華樣本缺圖長度119.789→42.692公尺、北投279.509→190.271公尺。原9組仍未全程通過，因此本輪沒有證據能宣稱拒絕率下降，更不能宣稱0拒絕。

目前graph gzip約17.38MB，較舊版增加約7MB，首次載入較重；Worker背景處理，沒有把它轉成主執行緒的全市繪圖圖層。現地施工、圖資偏移及缺漏仍需後續補齊。
