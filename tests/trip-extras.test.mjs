import test from "node:test";
import assert from "node:assert/strict";
import {
  parseTripSentence,
  matchPlace,
  identityFromUser,
  activeElevatorStops,
  nearestStop,
} from "../src/trip-extras.mjs";

test("a spoken trip keeps the identity, places and stop", () => {
  const parsed = parseTripSentence(
    "推嬰兒車從台北車站到大安森林公園，順便找無障礙廁所",
  );
  assert.deepEqual(parsed, {
    identity: "stroller",
    stop: "toilet",
    startName: "台北車站",
    endName: "大安森林公園",
  });
  assert.equal(
    matchPlace("台北車站", [
      { name: "台北車站出口", lat: 1, lon: 1 },
      { name: "台北車站", lat: 2, lon: 2 },
    ]).name,
    "台北車站",
  );
});

test("account data only changes prefs from an explicit access field", () => {
  assert.equal(identityFromUser({ name: "輪椅" }), null);
  assert.equal(identityFromUser({ identity: "輪椅使用者" }), "wheelchair");
});

test("today's elevator maintenance becomes an avoid point for that station", () => {
  const points = activeElevatorStops(
    {
      metro: {
        "metro-maintenance": [
          { 民國年月日: "1151107", 車站: "BR01(動物園站)" },
        ],
        "metro-alerts": [
          { 車站: "頂埔站", 說明: "月台電梯已修復完成及開放使用" },
        ],
      },
      fac: [
        { kind: "metro-elevator", station: "動物園", lat: 25, lon: 121.5 },
        { kind: "metro-elevator", station: "頂埔", lat: 25.1, lon: 121.6 },
      ],
    },
    Date.parse("2026-11-07T04:00:00Z"),
  );
  assert.deepEqual(points, [[25, 121.5]]);
});

test("a stop is chosen only within 150 metres of the route", () => {
  const route = { coordinates: [[25, 121.5]] };
  const near = { kind: "toilet", name: "近廁所", lat: 25.0001, lon: 121.5 };
  const far = { kind: "toilet", name: "遠廁所", lat: 25.01, lon: 121.5 };
  assert.equal(nearestStop(route, [far, near], "toilet").place.name, "近廁所");
  assert.equal(nearestStop(route, [far], "toilet"), null);
});
