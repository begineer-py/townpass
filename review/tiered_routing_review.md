# 分級路由需求對照

## 「官方人行道圖資覆蓋路段權重×1.0、OSM獨立人行道×1.8、銜接路段×3.5」

已實作於src/route-tiers.mjs，地圖有線型與文字圖例。

```js
const tier=edgeTier(proof);
let factor=options.preferOfficial===false&&tier!=='connector'?1:ROUTE_TIERS[tier].factor;
```

## 「起終點吸附距離放寬至50m」

已實作50公尺半徑，並投影到原人行線段，而非只找遠處節點。

```js
export const SNAP_METRES = 50;
projectPoint(start,options);projectPoint(end,options);
```

測試驗證長線段中段吸附、不同接點的整條路成本，以及沒有車道／過街證據時仍拒絕。

## 「確保全北市連通率達98%以上」

未達成。reports/tiered-routing-audit.json保留11個固定公開案例的完整結果，目前1個通過；芝山至兒童新樂園仍缺可用連接。未以人工直線或放行車道湊成功率。
