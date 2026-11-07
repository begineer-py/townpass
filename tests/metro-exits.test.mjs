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

test("exit numbers use the bundled exit icons when one exists", async () => {
  const { metroExitIconUrl } = await import("../src/metro-exits.mjs");
  const { readdirSync } = await import("node:fs");
  const files = new Set(readdirSync(new URL("../public/metro-icons/exits/", import.meta.url)));
  assert.equal(metroExitIconUrl({ exit: "M2" }), "./metro-icons/exits/M2.svg");
  assert.equal(metroExitIconUrl({ name: "中山站出口4電梯" }), "./metro-icons/exits/4.svg");
  assert.equal(metroExitIconUrl({ exit: "M9" }), "");
  for (const n of ["1", "11", "1A", "4A", "M1", "M8"]) assert.ok(files.has(`${n}.svg`), n);
});
