import test from "node:test";
import assert from "node:assert/strict";
import { sourceCountLabel } from "../src/format.mjs";

test("source counts show unavailable text when the data source is not ok", () => {
  assert.equal(sourceCountLabel({ status: "error", count: null }), "目前未取得資料");
});

test("missing source counts do not throw and are described as unavailable", () => {
  assert.equal(sourceCountLabel({ status: "ok", count: null }), "筆數未提供");
  assert.equal(sourceCountLabel({ status: "ok" }), "筆數未提供");
});

test("valid source counts are formatted for display", () => {
  assert.equal(sourceCountLabel({ status: "ok", count: 12000 }), `${(12000).toLocaleString()} 筆來源紀錄`);
});
