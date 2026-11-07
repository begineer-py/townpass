# 規劃中換點：舊搜尋占用路由 worker

## 功能與現象

規劃中更換起點或目的地時，舊請求的結果雖因 request ID 過期而不顯示，主 worker 內的同步路由搜尋仍會繼續執行，新的請求可能在後方排隊。舊結果不被顯示不等於舊計算已取消。

## 量測與重現

以獨立 Node worker、真實路網及新鮮施工資料測民權西路至松江南京：第一筆約 1,157ms 完成，第二筆在第一筆送出約 50ms 後送出，但約 2,219ms 才完成。這是隔離環境單次量測，不是實機或瀏覽器效能保證。

同環境中，第一筆啟動後約 50ms 取消，終止並重建 worker；新 worker 約 3.136 秒 ready，只回覆最新請求，舊請求被丟棄。瀏覽器已測試規劃期間改選東門，畫面最終顯示東門路線；此操作未單獨量測舊 worker 終止時間。

## 原因與修復

原有流程以 `request.current` 判斷回覆是否過期，但同步路由執行期間無法處理排在 worker 訊息佇列中的取消訊息。

新增 `createRouteWorkerLifecycle`：只有取消 busy worker 時才終止並重建，以 generation 隔離舊 ready、結果與錯誤；等待新 worker ready 時只保留最新請求，終止時結束待處理的官方驗證。附近候選及位置跟隨仍各用獨立 worker。

執行 `node --test tests/route-worker-lifecycle.test.mjs tests/local-fallback.test.mjs tests/route-worker-construction.test.mjs` 驗證；實機瀏覽器的中途取消效能與不同裝置仍需另測。
