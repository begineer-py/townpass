import test from "node:test";
import assert from "node:assert/strict";
import { stationKey } from "../src/format.mjs";

test("station key ignores line suffixes on generic metro results", () => {
  assert.equal(stationKey("臺北車站(R10)"), "台北車");
  assert.equal(stationKey("善導寺(BL13)"), "善導寺");
  assert.equal(stationKey("善導寺站"), "善導寺");
});
