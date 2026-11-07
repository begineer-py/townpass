---
name: debugger
description: 本專案的抓蟲流程：用瀏覽器 MCP 與 subagent 重現缺陷，並把功能、目前資料、相關程式碼片段與修復方法整理成報告寫入 /bugs。需要尋找、重現或記錄網站錯誤時使用。
---

# 使用說明
- 使用瀏覽器mcp和subagent抓bug
- 抓到的bug總結成report 放到/bugs
```text
/bugs
    bug1.md
    ...
```
## 內容
- 功能 針對某個應該運作但是不行的
- 數據 目前數據收集不夠
- 相關代碼片段
- 修復方法