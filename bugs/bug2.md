# BUG-02：通行設定按鈕造成整個 App 空白

- **類別：** 功能
- **嚴重度：** 高
- **環境：** Chrome；桌面與 390 × 844 手機尺寸模擬

## 重現方式

按下任一按鈕：

- 頁面上方的「閱讀與通行設定」
- 路線設定中的「調整通行偏好」

## 實際結果

React App 立即變成空白頁，必須重新載入才能恢復。瀏覽器 Console 記錄：`ReferenceError: routeModes is not defined`。此問題在桌面與手機尺寸都重現。

## 預期結果

開啟通行與閱讀設定面板，並可正常調整設定。

## 影響與證據

使用者無法調整無障礙通行偏好或閱讀設定；點擊後也會失去其他介面功能，直到重新載入。程式位置：[src/App.jsx:2029](../src/App.jsx#L2029)。測試記錄：[evidence/bug2-settings-console.txt](evidence/bug2-settings-console.txt)
