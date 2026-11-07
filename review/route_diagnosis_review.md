# 路線診斷與行穿線資料一致性

## 「自動避開施工區域」與過街檢查

接點搜尋與後續驗證現在共用包含補充圖資的行穿線資料，沒有移除施工或車道檢查。

```js
roadConnectorChecker(
  graph.roadGeometries,
  graph.supplementalEvidence
    ? officialGeometryEvidence(graph).crossings
    : graph.officialCrossingAreas,
)
```

證據：tests/tiered-routing.test.mjs的新增案例在補充行穿線存在時可找到接點，移除後回NO_CONNECTION；全套118項測試與正式建置通過。

## 「確保全北市連通率達98%以上」

尚未達成。相同施工快照的11組A/B比較仍僅1組通過；信義起點可用接點由5增加至6，但終點仍無接點。芝山兩端接點在不同連通分量，不考慮施工仍找不到路。逐組原因與資料雜湊見reports/route-diagnosis.json。
