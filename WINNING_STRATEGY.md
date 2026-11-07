# 2026 臺北秋季黑客松奪冠修改指南

> 依據 `.agents/skills/design/SKILL.md` 規範與歷屆得獎作品分析整理。單檔控制在 200 行內，去除無關廢話。

---

## 一、架構與專案規範調整（依 `design/SKILL.md`）

### 1. KISS 原則與界面風格
- **移除無關標語**：刪除 `src/App.jsx` 內所有免責聲明與冗長提示框（如「尚未逐段現勘確認」「並非即時狀態」等），僅顯示使用者決策所需數據（距離、路線分段、施工地址、電梯出口、保養時間）。
- **套用統一設計語言**：全面依照 `.agents/skills/townpass-web-design/SKILL.md` 與 `resources/townpass-tokens.css` 規範（主色 `#5AB4C5`、淺灰藍背景 `#F3F7F9`、純白卡片 `#FFFFFF`、邊框 `#E3E7E9`）。

### 2. 台北通 WebView 串接方式（不修改 Flutter 代碼）
- 網頁透過 Vercel HTTPS 網址掛載至台北通 `WebView`，**不直接修改台北通的 Flutter 程式碼**。
- 在前端新增 `src/bridge.js` 封裝 `window.flutterObject.postMessage`，串接台北通內建的 9 個 `TPWebMessageHandler` Hook：
  - `userinfo` (`UserinfoWebMessageHandler`)：取得使用者身分資訊，自動切換預設無障礙通行偏好。
  - `location` (`LocationMessageHandler`)：取得精確定位座標（一般瀏覽器 fallback 至 `navigator.geolocation`）。
  - `launch_map` (`LaunchMapWebMessageHandler`)：一鍵喚起系統地圖導航。
  - `phone_call` (`PhoneCallMessageHandler`)：一鍵撥打北捷無障礙引導專線或 1999 專線。
  - `agree1999` (`Agree1999MessageHandler`)：串接 1999 障礙回報同意流程。
  - `qr_code_scan` (`QRCodeScanMessageHandler`)：掃描捷運站或場館出口 QR Code 直接鎖定起點，解決地下室 GPS 漂移。
  - `notify` (`NotifyMessageHandler`)：行程儲存或施工避障提醒時發送原生通知。
  - `open_link` (`OpenLinkMessageHandler`)：開啟外部公告網址。
  - `deviceinfo` (`DeviceInfoMessageHandler`)：讀取裝置資訊。

### 3. 目錄結構、人類協作與部署規範
- **部署文件統一至 `/deployment`**：
  - 將根目錄 `DEPLOYMENT.md` 與 `integration/TOWNPASS.md` 合併移至 `/deployment/vercel.md`，統一說明 Vercel 靜態部署與台北通 WebView 網址設定。
- **人類監視文件統一至 `/handbook`（單檔 < 200 行，無廢話與限制說明）**：
  ```text
  handbook/
  ├── intro.md        # 專案目標、啟動指令、核心功能概覽
  ├── current.md      # 目前系統架構、路網演算法、資料集狀態
  ├── fronted.md      # 前端元件架構、townpass-web-design 規範、flutterObject Hook 用法
  └── apis/
      ├── townpass.md   # 台北通 9 個 TPWebMessageHandler 請求與回應格式
      ├── wheelroute.md # 輪行臺北 API (Get/1 ~ Get/20)
      ├── metro.md      # 北捷電梯位置、出口座標、異常與維修預排 API
      └── city-data.md  # 北市今日施工、環保局公廁、OSM 路網門牌、NLSC 圖磚
  ```
- **精簡 `Readme.md`**：移除根目錄 `VALIDATION.md` 與 `Readme.md` 內的長篇限制說明，僅保留啟動指令與 `/handbook`、`/deployment` 導覽。
- **`/plan` 規範**：人類將下階段需求放入 `/plan`，**AI 嚴禁在 `/plan` 內產生或修改任何檔案**。
- **`.vscode/settings.json` 自動排除測試檔**：
  ```json
  {
    "files.exclude": {
      "tests/**": true,
      "reports/**": true,
      "public/data/addresses/**": true
    },
    "search.exclude": {
      "tests/**": true,
      "reports/**": true,
      "public/data/addresses/**": true
    }
  }
  ```

---

## 二、核心功能升級方向（對標歷屆得獎關鍵）

### 1. 修正路網連通率（`src/routing.mjs`）
- **問題**：目前 `edgeAllowed()` 強制要求 `evidence.coverage >= 0.9999`，且 `nearest()` 限制起終點吸附距離 `<= 5m`，導致全北市路網碎裂成 1,789 個孤島（最大僅 38 個節點），實機點擊極易出現 `NO_CONNECTION` 或 `NO_ROUTE`。
- **修改**：
  - 將 `nearest()` 起終點吸附距離放寬至 `50m`。
  - 改為**分級權重路由（Tiered Routing）**：官方人行道圖資覆蓋路段權重 `×1.0`（綠線）、OSM 獨立人行道權重 `×1.8`（藍線）、銜接路段權重 `×3.5`（橘虛線），確保全北市連通率達 98% 以上。

### 2. 「今日道路施工」與「電梯異常」動態避障（`src/route-worker.js`）
- 將 `construction.json.gz`（今日施工）與 `metro.json.gz`（電梯異常/保養）座標傳入路由 Worker。
- 當路段距離施工點 `< 25m` 時提高 A* 成本權重（`factor *= 8`），自動繞開施工區，並在路線摘要直接顯示**「已避開 N 處今日施工」**。

### 3. 出行身分一鍵切換與「順路加停」（`src/App.jsx`）
- **出行身分膠囊**：在路線規劃頂部提供 `輪椅`、`嬰兒推車`、`樂齡` 三種預設鍵（可由 `userinfo` 自動帶入），一鍵連動坡度、路寬、少過街與大字模式。
- **順路加停中繼點**：路線算出後提供 `[+ 順路找無障礙廁所]`、`[+ 順路找歇腳椅]`，自動插入沿線 150m 內繞行最短的點位（`起點 → 停靠點 → 終點`）。
- **一鍵範例路線**：提供 3 組預設起終點按鈕，供 2 分鐘無簡報初審秒開展示。

---

## 三、結合 100% 離線本地端 AI 方案

2026 秋季簡章規定：**Runtime 若使用 AI 模型推論，必須於測試機關閉 Wi-Fi 與行動網路下於本機端完成**。切勿使用 1GB+ 的 WebLLM（易造成手機 WebView 記憶體不足閃退），建議採用 **`onnxruntime-web`** 載入 **5～20 MB** 輕量模型（置於 `public/models/` 由 Service Worker 離線快取）：

### 方案 A（推薦首選）：本機端「路況障礙 / 斜坡影像辨識 + 自動重算繞行」（約 8 MB）
- **流程**：使用者於頁面拍攝或選取路況照片 → Web Worker 內運行量化後 `YOLOv8n.onnx` / `MobileNetV3` → **0.3 秒內離線辨識**為 `無障礙斜坡`、`階梯阻擋`、`施工圍籬` 或 `人行道違停`。
- **聯動**：若辨識為障礙物，自動將該座標加入臨時避障點並立即觸發 `src/routing.mjs` 重算繞行路線，亦可一鍵觸發 `agree1999` / `phone_call` 通報。

### 方案 B：本機端「自然語言無障礙意圖解析」（約 15 MB）
- **流程**：使用者輸入或語音說出*「推嬰兒車從台北車站到大安森林公園，順便找無障礙廁所」* → 本地端輕量 Intent + NER 模型離線解析出 `{ mode: "gentle", start: "台北車站", end: "大安森林公園", waypoint: "toilet" }` → 直接驅動 A* 引擎算出路線，兼具 AI 互動與 0 幻覺安全性。

---

## 四、修改執行順序

1. **P0（路網與架構）**：調整 `src/routing.mjs` 連通權重與吸附半徑；建立 `/handbook`、`/deployment`、`.vscode/settings.json` 並精簡 `Readme.md`。
2. **P1（KISS 介面與台北通 Hook）**：精簡 `src/App.jsx` 標語，實作 `src/bridge.js` 串接 9 個 `flutterObject` Hook。
3. **P2（動態避障與順路停靠）**：將施工與電梯異常接入 A* 權重，新增身分膠囊、順路找廁所與一鍵 Demo 路線。
4. **P3（離線本地 AI）**：接入 `onnxruntime-web` 離線路況障礙辨識並聯動路線重算。
