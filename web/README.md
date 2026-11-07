# 簡記

前後端分開的最小網站。`frontend/` 是靜態頁面，`backend/` 是只回 JSON 的 FastAPI。部署到 Vercel 時，靜態檔由 CDN 提供，`/api` 進同一個 FastAPI Function。

```text
web/
├── backend/main.py      # FastAPI，匯出 app
├── frontend/            # HTML、CSS、JavaScript
├── pyproject.toml       # 告訴 Vercel 進入點是 backend.main:app
├── requirements.txt
└── .python-version      # 3.12
```

備忘存在行程記憶體。重新部署或冷啟動後會回到預設的兩則，這個範例沒有資料庫。

## 本地執行

在這個目錄：

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn backend.main:app --reload
```

開啟 <http://127.0.0.1:8000>。API 文件在 <http://127.0.0.1:8000/docs>。

請從 `web` 目錄啟動。`app.frontend("/", directory="frontend")` 的路徑是相對於這個目錄。

## 部署到 Vercel

1. 把這個儲存庫推到 GitHub、GitLab 或 Bitbucket。
2. 在 Vercel 匯入專案，**Root Directory 設成 `web`**。不要用整個儲存庫當根目錄，否則研究資料會一起被打包。
3. 不需要設定 Build Command 或 Output Directory。Vercel 會從 `requirements.txt` 认出 FastAPI，並讀取 `pyproject.toml` 的進入點。
4. 部署後開啟網站首頁，確認可以新增與刪除備忘，再開 `/docs` 看 API。

也可以在 `web` 目錄執行 `vercel`。CLI 需要 48.1.8 以上。

## API

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| `GET` | `/api/health` | 健康檢查 |
| `GET` | `/api/notes` | 備忘清單 |
| `POST` | `/api/notes` | 新增，JSON 為 `{"text": "..."}`，最多 200 字 |
| `DELETE` | `/api/notes/{id}` | 刪除 |
