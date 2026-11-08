# 儲存庫公開網址失效

- 功能：GitHub 儲存庫的首頁應連到可開啟的服務。
- 重現：儲存庫 homepage `https://town-pass-zeta.vercel.app` 的首頁與路線 API 回傳 404 `DEPLOYMENT_NOT_FOUND`；GitHub 另顯示兩個 Vercel 部署成功，不能據此確認失效網址的歸屬或替代網域。
- 資料：公開部署狀態只提供 Vercel 控制台連結，尚未取得已確認的正式網域。
- 待修復：取得正確的 Vercel 專案網域後，實測首頁與路線 API，再更新 GitHub 儲存庫 homepage 或修復網域綁定。
