# GET /api/official-condition-detail

查詢單筆官方不利通行紀錄的缺失原因與活動區域分類。

- 只接受 `type=missing_noCurbSlope` 或 `type=missing_crosswalkNoRamp`，以及 1 到 12 位數字 `id`。
- 同源代理，只送類型與 ID，不送路線座標。上游是臺北市人行道圖台 `detail_v2`。
- 成功只回 `id`、`type`、`cause`、`activity`。類型或 ID 不符回 400；上游失敗或內容對不上回 502。缺資料不當成零筆。

路線頁對淨寬不足紀錄顯示原因。使用者可逐筆嘗試繞路：重算保留已選紀錄，排除各點 10 公尺，並重查路網與施工。找不到時保留原路線。避開紀錄點不是現場確認。
