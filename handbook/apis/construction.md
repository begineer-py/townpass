# GET /api/construction

取得臺北市今日施工資訊，僅回傳路由需要的公開欄位。原始來源：`https://tpnco.blob.core.windows.net/blobfs/Todaywork.json`。

回應包含schemaVersion、fetchedAt、sourceUpdatedAt及works。每筆有施工位置、核准日期、時段、影響通行、替代方案及轉換為WGS84的幾何。監工、電話、廠商姓名等欄位不回傳。

- 伺服器快取最多2分鐘；HTTP回應no-store，Service Worker不快取API。
- 同時檢查取得時間及來源Last-Modified；超過30分鐘或來源無法更新回503。
- 每次線上規劃並行取得路線及施工資料。離線只能使用記憶體內仍有效的資料。
- 台北時間判斷日期及單一明確施工時段，跨午夜正確對應前一日。長設工區在核准日期內持續避讓；複雜文字時段保守視為可能施工。
- 穿越封閉環幾何時擋下；只有點、線定位時，在10公尺內保守避讓，不能稱為已確認的完整封閉面。70公尺內列附近提醒，與每一完整路段比較。
- 無影響通行的紀錄只提醒，不當作安全認證。無法定位的影響通行紀錄另顯示筆數，不能宣稱全部工區均已涵蓋。

遇到影響通行工區時，本機路由排除相關邊並重算，再做完整人行道、過街與入口驗證。無合格替代路線則回CONSTRUCTION_BLOCKED；不以車道或直線繞行。

測試：tests/construction.test.mjs；線上來源驗證：reports/construction-routing-audit.json。
