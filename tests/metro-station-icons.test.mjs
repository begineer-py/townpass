import test from "node:test";
import assert from "node:assert/strict";
import {
  metroStationCodes,
  metroStationIconUrl,
} from "../src/metro-station-icons.mjs";

test("extracts one or more Taipei Metro station codes", () => {
  assert.deepEqual(metroStationCodes("台北車站(R10)", "台北車站(BL12)"), [
    "R10",
    "BL12",
  ]);
  assert.deepEqual(metroStationCodes(["G03A", "g03a"]), ["G03A"]);
});

test("station icons load from this site, not Wikimedia", () => {
  assert.equal(metroStationIconUrl("BL13"), "./metro-icons/BL13.svg");
  assert.equal(metroStationIconUrl("not-a-station"), "");
  assert.equal(metroStationIconUrl("R99"), "");
});

test("every bundled icon file exists", async () => {
  const { readdirSync } = await import("node:fs");
  const files = new Set(readdirSync(new URL("../public/metro-icons/", import.meta.url)));
  for (const code of ["R10", "BL12", "G03A", "Y20", "BR01"]) {
    assert.ok(files.has(`${code}.svg`), code);
    assert.equal(metroStationIconUrl(code), `./metro-icons/${code}.svg`);
  }
});
