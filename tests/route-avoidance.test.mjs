import test from "node:test";
import assert from "node:assert/strict";
import {
  diagnoseAvoidedStairs,
  stairDetails,
} from "../src/route-avoidance.mjs";

test("stair diagnostics return locations without exposing the diagnostic route", () => {
  let received;
  const stairs = diagnoseAvoidedStairs(
    (_start, _end, options) => {
      received = options;
      return {
        steps: [
          {
            way: 7,
            highway: "steps",
            name: "廣場階梯",
            lat: 25.04,
            lon: 121.51,
            distance: 18.4,
          },
        ],
      };
    },
    [25, 121.5],
    [25.1, 121.6],
    { avoidSteps: true },
  );
  assert.equal(received.avoidSteps, false);
  assert.deepEqual(stairs, [
    {
      way: 7,
      name: "廣場階梯",
      lat: 25.04,
      lon: 121.51,
      distance: 18,
    },
  ]);
  assert.deepEqual(stairDetails({ error: "NO_ROUTE" }), []);
});
