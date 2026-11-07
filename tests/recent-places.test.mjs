import test from "node:test";
import assert from "node:assert/strict";
import { addRecentPlace } from "../src/recent-places.mjs";

test("recent places record selections once, newest first, with a fixed limit", () => {
  let list = [];
  for (let i = 0; i < 12; i++) list = addRecentPlace(list, { id: String(i), name: `地點${i}`, lat: 25, lon: 121.5, kind: "place" });
  assert.equal(list.length, 10);
  list = addRecentPlace(list, { id: "5", name: "再次點選", lat: 25, lon: 121.5 });
  assert.equal(list[0].id, "5");
  assert.equal(list.filter((p) => p.id === "5").length, 1);
  assert.equal(addRecentPlace(list, { id: "my-location", name: "我的位置", lat: 25, lon: 121.5 }), list);
  assert.equal(addRecentPlace(list, { id: "bad", name: "地點", lat: NaN, lon: 121.5 }), list);
});
