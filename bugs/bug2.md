# BUG-02：通行設定按鈕造成整個 App 空白

- **類別：** 功能／介面崩潰
- **嚴重度：** 高
- **環境：** Chrome；桌面與 390 × 844 手機尺寸模擬
- **狀態：** 瀏覽器記錄確認崩潰；目前程式碼與記錄中的錯誤名稱不一致

## 功能與重現方式

按下任一按鈕：

- 頁面上方的「閱讀與通行設定」
- 路線設定中的「調整通行偏好」

## 實際結果

React App 立即變成空白頁，必須重新載入才能恢復。瀏覽器 Console 記錄：`ReferenceError: routeModes is not defined`。測試記錄指出桌面與手機尺寸都可重現。

## 預期結果

開啟「通行與閱讀設定」面板，使用者可以調整出行方式、路線偏好及閱讀設定；關閉面板後其餘介面仍可操作。

## 資料與證據

證據檔保存了錯誤名稱、觸發操作及桌面／手機重現結果：[evidence/bug2-settings-console.txt](evidence/bug2-settings-console.txt)。但記錄沒有保存當時執行的來源版本或 source map，無法把瀏覽器產生的 `App.jsx:3484:38` 對應到目前 checkout 的原始碼。

**目前來源版本的差異：** 現行 `src/App.jsx` 找不到 `routeModes`；偏好面板目前以 `travelProfiles` 和內嵌路線偏好清單產生選項（約第 2177–2207 行）。因此，舊報告中的 [src/App.jsx:2029](../src/App.jsx#L2029) 不是目前可確認的錯誤位置。這表示瀏覽器記錄和目前來源快照需要先對齊；現有記錄仍能證明當時發生過崩潰，但不能證明目前版本仍有相同程式錯誤。

## 相關程式碼

目前偏好面板的選項來源如下：

```jsx
{Object.entries(travelProfiles).map(([id, profile]) => (
  <option key={id} value={id}>
    {profile.label}
  </option>
))}

{Object.entries({
  balanced: "均衡走法",
  gentle: "偏好平緩",
  crossings: "減少過街",
}).map(([id, name]) => (
  <option key={id} value={id}>
    {name}
  </option>
))}
```

## 修復方向

1. 先用目前來源版本重新開啟兩個設定入口，確認問題是否仍可重現；若重現，保存完整 Console stack 與來源版本資訊。
2. 若錯誤仍是 `routeModes is not defined`，改用已宣告的路線偏好資料，或補上與畫面用途一致的 `routeModes` 定義，並檢查兩個入口共用的設定面板。
3. 加入局部錯誤邊界或安全的面板渲染處理，避免設定元件錯誤清空整個 App。
