# BUG-03：資料來源面板因筆數欄位缺值而崩潰

- **類別：** 數據／功能
- **嚴重度：** 中
- **環境：** Chrome；`http://localhost:5173/`

## 重現方式

按下頁面底部的「資料來源」。

## 實際結果

整個 App 變成空白頁，必須重新載入才能恢復。Console 記錄：`TypeError: Cannot read properties of undefined (reading 'toLocaleString')`。資料來源面板直接對 `count` 呼叫 `toLocaleString()`；來源資料中有筆數缺值或為 `null` 的項目，例如 `wheel-9`、`sidewalk-range-2026`、`crosswalk-2026`、`marked-sidewalk-2026`、`curb-ramps-2026`。

## 預期結果

來源筆數缺漏時仍應能開啟面板，並以「未提供」等文字呈現。

## 影響與證據

使用者無法查看資料來源與更新資訊，且一次點擊會使整個 App 無法使用，直到重新載入。程式位置：[src/App.jsx:2163](../src/App.jsx#L2163)。測試記錄：[evidence/bug3-sources-console.txt](evidence/bug3-sources-console.txt)
