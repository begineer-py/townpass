import test from "node:test";
import assert from "node:assert/strict";
import { matchMetroStations } from "../src/station-matches.mjs";

test("station groups combine line codes and the station's own entrances", () => {
  const metro = { "metro-elevators": [
    { "車站名稱": "台北車站", "車站編號": "R10" },
    { "車站名稱": "台北車站", "車站編號": "BL12" },
    { "車站名稱": "善導寺", "車站編號": "BL13" },
  ] };
  const facilities = [
    { id: "a", kind: "metro-elevator", station: "臺北車站" },
    { id: "b", kind: "metro-elevator", station: "善導寺" },
  ];
  const [match] = matchMetroStations("臺北車站", metro, facilities);
  assert.deepEqual(match.codes, ["R10", "BL12"]);
  assert.deepEqual(match.exits.map((p) => p.id), ["a"]);
  assert.equal(matchMetroStations("", metro, facilities).length, 0);
  assert.equal(matchMetroStations("不存在", metro, facilities).length, 0);
});
