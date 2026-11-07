# 台北通嵌入

本專案是獨立的 HTTPS 網頁微服務。台北通只需將部署後的服務網址加入服務入口，並以 WebView 開啟；本專案不需要修改或編譯 Flutter App，也不需要設定 Flutter build 參數。

## 串接步驟

1. 依照[部署說明](../deployment/README.md)將網站部署至 Vercel。
2. 確認正式網址使用 HTTPS，且首頁與地圖資料都能由手機瀏覽器開啟。
3. 將正式網址交給台北通服務維運者，加入服務目錄並設定為此微服務的開啟網址。
4. 由台北通 App 開啟該網址，確認頁面能在 WebView 內正常顯示。

服務網址由部署平台管理；切換 Vercel 網域或自訂網域時，請同步更新台北通服務目錄中的網址。

## 定位

首次設定出行方式時，頁面會透過 `userinfo` bridge 讀取帳號識別值，僅在本機以 SHA-256 雜湊值區分出行偏好；不保存姓名、身分證字號、電話或原始帳號識別值。出行類型與行程寫入 IndexedDB，路線偏好與收藏留在本機儲存空間；不支援 IndexedDB 時，出行類型與行程也會回退至本機儲存空間。

首次完成設定後，頁面會請求瀏覽器定位權限，並以目前位置作為預設起點。拒絕定位仍可搜尋地點或在地圖選點。Vercel 提供 HTTPS；定位由標準瀏覽器 Geolocation API 提供。

## 使用的台北通 bridge

`src/townpass-bridge.js` 依 [taipei-doit/TownPass](https://github.com/taipei-doit/TownPass) `lib/util/web_message_handler` 的名稱送出訊息，只允許下列四個：

| 訊息 | 台北通的行為 | 本服務的用途 |
| --- | --- | --- |
| `userinfo` | 回傳整份帳號資料（含身分證字號、姓名、生日、地址） | 只取 `id` 計算 SHA-256 雜湊鍵，區分本機資料；其他欄位不保存 |
| `location` | 回傳 `Position.toJson()`；沒有權限時回傳 `[]` | 備援定位：先用瀏覽器定位，失敗時才向台北通要位置 |
| `open_link` | 以新的 WebView 頁面開啟網址，不回覆 | 外部連結與 `target="_blank"`（WebView 不支援新視窗） |
| `1999agree` | 確認條款後開啟 1999 語音通報，成功時不回覆 | 路線頁「1999 通報路障」 |

未使用：`launch_map`（外部地圖不會走無障礙路線，容易誤導）、`phone_call`、`deviceinfo`、`notify`、`qr_code_scan`。

## 上線驗收

- 從台北通服務入口開啟正式 HTTPS 網址。
- 首頁、地圖圖磚和地圖資料載入正常。
- 台北通 WebView 可回覆 `userinfo`；沒有 bridge 時仍可用本機偏好。
- 定位允許、拒絕與逾時時都能繼續以搜尋或地圖選點操作。
- iOS 與 Android 的 WebView 版面、返回操作、系統字級和輔助使用功能均需在宿主 App 中另行驗收。

目前尚未宣稱已在台北通正式服務目錄上架，也尚未完成 iOS／Android 真機驗收。
