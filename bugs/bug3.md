# BUG-03：資料來源面板因筆數欄位缺值而崩潰

- **類別：** 數據／功能崩潰
- **嚴重度：** 中
- **環境：** Chrome；`http://localhost:5173/`
- **狀態：** 目前資料檔與程式碼均可確認缺值未受保護

## 功能與重現方式

按下頁面底部的「資料來源」。

## 實際結果

整個 App 變成空白頁，必須重新載入才能恢復。Console 記錄：`TypeError: Cannot read properties of undefined (reading 'toLocaleString')`。目前 checkout 的來源檔有多筆 `count: null`；測試 Console 顯示 `undefined`，表示執行時資料和目前資料檔的具體缺值形式不完全一致。無論是 `null` 或 `undefined`，直接讀取其 `toLocaleString` 都會拋出例外。

## 預期結果

來源筆數未提供時，面板仍應正常開啟，並顯示「筆數未提供」或相近文字；狀態為錯誤或未取得資料時，則顯示目前的資料狀態。

## 資料與證據

目前 `public/data/sources.json.gz` 中的相關欄位如下：

| 來源 ID | 狀態 | `count` |
|---|---|---:|
| `wheel-9` | `error` | `null` |
| `sidewalk-range-2026` | `ok` | `null` |
| `crosswalk-2026` | `ok` | `null` |
| `marked-sidewalk-2026` | `ok` | `null` |
| `curb-ramps-2026` | `ok` | `null` |

`wheel-9` 目前會走「目前未取得資料」分支；其餘四筆狀態為 `ok`，會進入不安全的筆數格式化分支。測試記錄：[evidence/bug3-sources-console.txt](evidence/bug3-sources-console.txt)

## 相關程式碼

[src/App.jsx:2332](../src/App.jsx#L2332) 的資料來源面板直接對 `count` 呼叫 `toLocaleString()`，未檢查值是否存在或為有限數字：

```jsx
{s.status === "ok"
  ? `${s.count.toLocaleString()} 筆來源紀錄`
  : "目前未取得資料"}
```

## 修復方向

先驗證 `count` 是有限數字，再格式化；狀態為 `ok` 但筆數缺漏時顯示「筆數未提供」。例如：

```jsx
{s.status !== "ok"
  ? "目前未取得資料"
  : Number.isFinite(s.count)
    ? `${s.count.toLocaleString()} 筆來源紀錄`
    : "筆數未提供"}
```

若來源筆數是必要欄位，也可在資料產生／驗證流程中攔截缺值；但 UI 仍應能容忍外部來源資料不完整，避免一張來源卡片讓整個 App 崩潰。

## 2026-11-07 重新驗證

在 `6112846` 加 `b994c10` 的獨立本機服務，桌面瀏覽器可正常開關資料來源面板；四筆 `ok` 且筆數為 `null` 的資料顯示「筆數未提供」。未人工注入 `undefined`，舊版錯誤的精確修復版本尚未確認。
