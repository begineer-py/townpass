# 部署

本專案是 Vite 網站。路線搜尋、候選路線與驗證在 `api/route-compute.js` 的後端執行，後端使用隨函式打包的人行路網及市府資料；瀏覽器不再下載路網進行運算。`api/construction.js` 提供施工資料，因此不能只上傳 `dist`。路線不呼叫市府路線規劃 API。路線規劃需要網路連線。部署不需要資料庫、環境變數或 Flutter 專案。

## 以 Git 儲存庫部署

1. 將專案推送至可由 Vercel 存取的 GitHub、GitLab 或 Bitbucket 儲存庫。
2. 在 Vercel Dashboard 選擇 **Add New → Project**，匯入該儲存庫。
3. 將 **Root Directory** 設為專案根目錄。根目錄的 `vercel.json` 已固定使用 Vite、`npm ci`、`npm run build` 與 `dist`。若 Vercel 專案設定仍顯示 FastAPI，改選 **Vite** 並清除自訂的 Python Build／Install Command。

   | 設定 | 值 |
   | --- | --- |
   | Framework Preset | Vite |
   | Install Command | `npm ci` |
   | Build Command | `npm run build` |
   | Output Directory | `dist` |

4. 不需新增環境變數。選擇 **Deploy**。
5. 部署完成後，Vercel 會提供 HTTPS 網址。先用該網址檢查 Preview／Production 部署，再將正式網址交給台北通服務維運者，加入服務目錄並設為 WebView 開啟網址。

Vercel 可在專案設定自訂網域；設定完成後應使用該 HTTPS 網域，並同步更新台北通服務目錄。連接 Git 後，追蹤分支的新提交會觸發新的部署；Production 分支的部署網址才應提供給台北通正式服務使用。

## 部署後檢查

- 開啟部署根網址，確認首頁及地圖可正常載入。
- 確認 `/data/facilities.json.gz`、`/data/address-index.json` 回應成功，並確認設施資料能在頁面內正常載入。
- 確認 `POST /api/route-compute` 與施工 API 正常；以 GET 呼叫路線 API 回 405 是預期行為。
- 實際規劃路線並檢查後端函式日誌：首次請求需要載入壓縮路網，需確認部署方案的函式執行時間和記憶體足夠。
- 確認路線規劃、設施搜尋、地址搜尋及 Service Worker 離線快取可用；離線時不能計算新路線。
- 在手機 HTTPS 瀏覽器測試定位權限；台北通 WebView 也需由宿主允許網站定位。
- 更新資料或程式後重新部署，確認正式網址仍載入新版本。

## 本機預覽正式建置

```sh
npm ci
npm run build
npm run preview
```

Vite 會先驗證路網資料，再將靜態成品輸出至 `dist/`。Vercel 的 Vite 設定與輸出目錄可參考[官方建置設定說明](https://vercel.com/docs/builds/configure-a-build)；Git 連接與自動部署方式請參考[官方 Git 部署說明](https://vercel.com/docs/git)。
