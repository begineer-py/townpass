# 整合資料包

`python scripts/package-integrated-data.py` 依目前 `public/data` 製作 `data/processed/taipei-integrated-data.zip`；`python scripts/package-integrated-data.py --verify` 可檢查封裝內容及 SHA-256。輸出位於忽略的本機資料目錄，不提交原始資料或快取。

封裝包含現有路網、路線圖資證據、設施、捷運、地點、門牌索引與分片及來源清單。路網已將 OSM 人行路線與市府人行面和行穿線證據整合；本封裝只將既有資料放在一起，**不新增路網連接、也不證明所有路線可通行**。`manifest.json` 列出檔案與其雜湊；詳細出處與使用條件見封裝內 `sources.json.gz` 和原始資料提供者。

施工資料依執行時線上資料與新鮮度檢查，未放入資料包。官網原始快取 `pano-sidewalk_accessiblePassageway.json` 和 `pano-missing_v2.json` 尚未納入正式路網或封裝，需確認資料語意及重用條件。下載時間不是現地調查時間。
