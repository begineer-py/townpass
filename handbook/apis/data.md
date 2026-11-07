# 靜態資料端點

本服務沒有自訂的後端 API。部署後由靜態主機透過 HTTP GET 提供以下檔案；實際路徑會帶上網站的 base path。

## 應用資料

| 路徑 | 用途 |
| --- | --- |
| `/data/graph.json.gz` | 路線計算用路網，由 Web Worker 載入 |
| `/data/facilities.json.gz` | 臺北市設施與捷運出口 |
| `/data/places.json.gz` | 地名與搜尋項目 |
| `/data/metro.json.gz` | 捷運車站、公告與保養資訊 |
| `/data/construction.json.gz` | 施工資料快照 |
| `/data/sources.json.gz` | 資料來源及擷取紀錄 |
| `/data/official-paths.json.gz` | 官方人行空間幾何證據 |

## 地址搜尋

`/data/address-index.json` 提供路名索引；`/data/addresses/{file}.json` 是按路名載入的門牌分片。瀏覽器只載入搜尋命中的分片。

## 資料更新

來源同步程式位於 `scripts/sync_data.py` 與 `scripts/enrich_data.py`。同步來源包含臺北市資料平台、輪行臺北與臺北市施工資料；更新後依序重建路網、封裝資料並整合官方人行空間，最後重新建置網站。
