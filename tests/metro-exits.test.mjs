import test from "node:test";
import assert from "node:assert/strict";
import { metroExitLabel } from "../src/metro-exits.mjs";

test("uses each metro exit's published identifier", () => {
  assert.equal(metroExitLabel({ exit: "M2" }), "M2");
  assert.equal(metroExitLabel({ exit: "出口3" }), "3");
  assert.equal(metroExitLabel({ name: "善導寺站出口電梯-出口3" }), "3");
});

test("falls back to the elevator marker when no exit is published", () => {
  assert.equal(metroExitLabel({ name: "捷運站電梯" }), "梯");
});
