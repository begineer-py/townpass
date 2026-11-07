import test from "node:test";
import assert from "node:assert/strict";
import { activeElevatorStops, nearestStop } from "../src/trip-extras.mjs";

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
