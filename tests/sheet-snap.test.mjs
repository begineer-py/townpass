import test from "node:test";
import assert from "node:assert/strict";
import { nearestSheetSnapIndex } from "../src/sheet-snap.mjs";

test("short route panel stays expanded at its reachable content height", () => {
  const snaps = [0.24, 0.56, 0.9];
  assert.equal(nearestSheetSnapIndex(304, 304, 844, snaps), 1);
  assert.equal(nearestSheetSnapIndex(215, 304, 844, snaps), 0);
});

test("long panel selects the nearest normal viewport snap", () => {
  const snaps = [0.24, 0.56, 0.9];
  assert.equal(nearestSheetSnapIndex(470, 900, 844, snaps), 1);
  assert.equal(nearestSheetSnapIndex(750, 900, 844, snaps), 2);
});
