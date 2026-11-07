import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
const read = name => JSON.parse(gunzipSync(readFileSync(new URL(`../public/data/${name}.json.gz`, import.meta.url))));
const exits = read("metro-exits"), unlocated = read("metro-unlocated-exits");
const byName = name => exits.find(p => p.name === name);

test("official exit coordinates are complete, unique, and preserve uncertain elevator status", () => {
  assert.equal(exits.length, 390);
  assert.equal(new Set(exits.map(p => p.id)).size, 390);
  assert.equal(exits.filter(p => p.elevator === true).length, 162);
  assert.ok(exits.every(p => p.kind === "metro-exit" && Number.isFinite(p.lat) && Number.isFinite(p.lon) && (p.elevator === null || p.elevator === true) && p.stationCode && p.stationCodes.includes(p.stationCode)));
  assert.deepEqual([byName("頂埔站出口1").stationCode, byName("頂埔站出口1").elevator], ["BL01", true]);
  assert.equal(byName("頂埔站出口2").elevator, null);
  assert.equal(byName("迴龍站出口1").stationCode, "O21");
  assert.equal(byName("廣慈/奉天宮站出口1").stationCode, "R01");
  assert.equal(byName("十四張站出口").stationCode, "Y08");
});

test("independent access and elevator fields and validated transfer codes remain distinct", () => {
  assert.equal(byName("紅樹林站出口2").elevator, true);
  assert.equal(byName("紅樹林站出口2").officialAccessible, false);
  assert.equal(byName("紅樹林站出口2").elevatorUpdatedAt, "2026-09-02");
  assert.equal(byName("新北投站出口1").stationCode, "R22A");
  assert.equal(byName("小碧潭站出口1").stationCode, "G03A");
  assert.deepEqual(byName("台北車站M1").stationCodes, ["BL12", "R10"]);
  assert.equal(byName("南港展覽館站出口2A").exit, "2A");
});

test("five unmatched official entrances are retained without invented coordinates", () => {
  assert.equal(unlocated.length, 5);
  assert.deepEqual(unlocated.map(p => p.station).sort(), ["北投站", "奇岩站", "新北投站", "明德站", "科技大樓站"].sort());
  assert.ok(unlocated.every(p => p.kind === "metro-exit-unlocated" && !("lat" in p) && !("lon" in p)));
  assert.equal(unlocated.find(p => p.station === "科技大樓站").description, "近復興南路2段與和平東路2段交叉口");
});
