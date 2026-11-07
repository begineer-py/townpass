---
name: design
description: 好好走（臺北通無障礙地圖微服務）的專案設計與協作規範：KISS 介面、沿用 townpass-web-design 設計系統、臺北通 WebView 與 Flutter hook 整合、Vercel 部署、程式碼與 README 風格、handbook/bugs/plan/review 目錄慣例及自動審查格式。建立或修改本專案的頁面、元件、文件、部署設定或審查紀錄時使用。
---

# 設計指南
## KISS原則
- 使用者只需要看到夠用的資訊,不要無關標語,一個搜尋框預設界面
## 界面風格
- 使用.agents\skills\townpass-web-design設計

## 部屬
- 把部屬統一到vercel上面的教學放到 /deployment下

## 代碼風格
- 不要無關的廢話 分清楚給人看得和代碼 尤其是readme那些的

## 使用方式
- 台北通使用web_view來入網頁,不要直接修改台北通的flutter代碼
- 可以使用台北通的hook例如
```json
  static final List<TPWebMessageHandler> _cachedMessageHandlers = [
        UserinfoWebMessageHandler(),
        LaunchMapWebMessageHandler(),
        PhoneCallMessageHandler(),
        Agree1999MessageHandler(),
        LocationMessageHandler(),
        DeviceInfoMessageHandler(),
        OpenLinkMessageHandler(),
        NotifyMessageHandler(),
        QRCodeScanMessageHandler(),
      ];
```
## 人類協作
- 把人類需要監視的檔案和說明統一放在/handbook內
- 單個檔案不要包含無關廢話和所謂限制 行數200行內
- 目錄
```text
intro.md
current.md
fronted.md
apis/
    {endpoint...}.md
```
- 人類把需要更改的下個方向放在/plan內 不的在plan內產生修改任何檔案
- 設計.vscode自動排除人類不需要看的
- Readme.md不應提到部屬方式 而是鏈接到/deployment
## 自動審查
- cursor的自動bot將會審查
- 把針對一條條plan的版本後請生成review裡面
- 裡面只包括針對目標的代碼片段 例如需求"(原文)"已經完成"(證據) 代碼
- 不要把開發的無用side code 上傳
```text
/review
    {version}_review.md
```
