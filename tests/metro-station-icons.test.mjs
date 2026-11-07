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

test("builds a constrained Wikimedia Commons station icon URL", () => {
  assert.equal(
    metroStationIconUrl("BL13"),
    "https://commons.wikimedia.org/wiki/Special:Redirect/file/Taipei_Metro_station_BL13.svg",
  );
  assert.equal(metroStationIconUrl("not-a-station"), "");
});
