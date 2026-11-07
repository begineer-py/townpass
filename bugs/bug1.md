# BUG-01：路線規劃未能產生路線

- **類別：** 功能
- **嚴重度：** 高
- **環境：** Chrome；`http://localhost:5173/`
- **狀態：** 已有失敗案例；根因尚未確認
- **版本註記：** 瀏覽器記錄早於目前路線驗證更新；尚未在最新分支重試

## 功能與重現方式

1. 開啟「規劃路線」。
2. 選擇「明德(R18)」為出發地、「石牌(R19)」為目的地。
3. 按「規劃路線」。

另一次測試以目前位置前往附近坡道。

## 實際結果

- 明德至石牌沒有產生路線，畫面顯示：「這個位置沒有完整的定位資料，請重新選擇出發地或目的地。」
- 目前位置前往附近坡道也沒有產生路線，畫面顯示：「這個版本的路線服務尚未就緒，暫時無法規劃。附近設施仍可查詢。」

兩種訊息代表不同失敗分支，現有記錄不足以把它們歸因為同一個根因。

## 預期結果

具有有效座標且位於支援範圍內的起點與終點應能取得經驗證的路線。若座標、路網或路線服務不可用，介面應指出可採取的下一步，並保留起終點供重試。

## 資料與證據

測試記錄確認手機尺寸下定位成功，但未保存兩個選點解析後的資料（`id`、`kind`、`lat`、`lon`）、請求內容、HTTP 回應或路線 Worker 結果。因此目前無法判斷失敗是選點座標缺漏、路線服務未啟動，或本機路網沒有可驗證的連通路徑。

證據檔：[evidence/bug1-route.txt](evidence/bug1-route.txt)

## 相關程式碼

[src/App.jsx:674](../src/App.jsx#L674) 會依選點種類選擇官方服務或本機路網；捷運站類別會走本機路網分支：

```jsx
if (from && to && navigator.onLine && !points?.via &&
    ![from, to].some(p => ['20', 'station'].includes(String(p.kind)))) {
  // Online route request; station places use the local graph branch below.
  requestOfficialRoute([from.lat, from.lon], [to.lat, to.lon], requestPrefs, controller.signal);
}
```

官方服務對缺少或非數字座標回報 `OFFICIAL_INVALID_POINTS`，檢查位置在 [src/route-request.mjs:3](../src/route-request.mjs#L3)。本機捷運站路線則會經 `planPlaces()` 尋找站點電梯出口並查本機路網，位置在 [src/local-route-verifier.mjs:43](../src/local-route-verifier.mjs#L43)。目前分支已更新本機路線的入口檢查與候選路線排序，相關程式碼和最初測試時的版本不同；這些更新尚未針對上述案例重試。

目前報告中的兩個站名若解析為 `kind: "station"` 或 `kind: "20"`，依現行程式應走本機路網；但證據顯示的是官方服務的座標錯誤訊息。由於缺少實際選點物件與請求記錄，這個差異尚待釐清。

## 修復方向

1. 先記錄選點解析結果、所走分支、路線請求／Worker 回應，確認兩個案例各自的失敗點。
2. 若選點缺座標，修正搜尋結果或站點到電梯出口的對應，並在送出前檢查座標。
3. 若本機開發環境未提供 `/api/accessible-route`，啟動對應 API 或設定明確的開發代理，避免把服務未啟動誤當成路線本身不可行。
4. 若站點進入本機路網但無法連通，檢查站點電梯出口資料與圖節點連接；不要把缺座標錯誤套用到路網無路徑的情況。
