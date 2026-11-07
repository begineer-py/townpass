# 設計指南 
## KISS原則 
- 使用者只需要看到夠用的資訊,不要無關標語,
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
- 設計.vscode自動排除人類不需要看的test檔案

