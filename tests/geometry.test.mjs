import test from "node:test";
import assert from "node:assert/strict";
import {
  polygonConnectorChecker,
  roadConnectorChecker,
} from "../src/geometry.mjs";
const polygon = (rings) => ({ type: "Polygon", coordinates: rings });
const box = (x1, y1, x2, y2) => [
  [x1, y1],
  [x2, y1],
  [x2, y2],
  [x1, y2],
  [x1, y1],
];
test("connector cannot cross a gap between parallel sidewalks", () => {
  const check = polygonConnectorChecker([
    polygon([box(121.5, 25, 121.50001, 25.0001)]),
    polygon([box(121.50003, 25, 121.50004, 25.0001)]),
  ]);
  assert.equal(check([25.00005, 121.500005], [25.00005, 121.500035]), false);
});
test("connector fully inside the same official area is accepted", () => {
  const check = polygonConnectorChecker([
    polygon([box(121.5, 25, 121.501, 25.001)]),
  ]);
  assert.equal(check([25.0001, 121.5001], [25.00012, 121.50012]), true);
});
test("hole in an official polygon is not traversable", () => {
  const check = polygonConnectorChecker([
    polygon([
      box(121.5, 25, 121.501, 25.001),
      box(121.5004, 25.0004, 121.5006, 25.0006),
    ]),
  ]);
  assert.equal(check([25.0005, 121.5003], [25.0005, 121.5007]), false);
});
test("touching official polygons permit a continuous covered connector", () => {
  const check = polygonConnectorChecker([
    polygon([box(121.5, 25, 121.5005, 25.001)]),
    polygon([box(121.5005, 25, 121.501, 25.001)]),
  ]);
  assert.equal(check([25.0005, 121.5001], [25.0005, 121.5009]), true);
});
test("missing official areas fail closed", () =>
  assert.equal(polygonConnectorChecker()([25, 121.5], [25, 121.5]), false));
test("short connector across a road requires crossing evidence even inside a sidewalk polygon", () => {
  const check = roadConnectorChecker(
    [
      [
        [121.50002, 24.999],
        [121.50002, 25.001],
      ],
    ],
    [],
  );
  assert.equal(check([25, 121.5], [25, 121.50004]), false);
});
test("short connector may cross only inside an official crossing", () => {
  const check = roadConnectorChecker(
    [
      [
        [121.50002, 24.999],
        [121.50002, 25.001],
      ],
    ],
    [polygon([box(121.5, 24.99999, 121.50004, 25.00001)])],
  );
  assert.equal(check([25, 121.5], [25, 121.50004]), true);
});
test("connector cannot run along a vehicle centerline outside a crossing", () => {
  assert.equal(
    roadConnectorChecker(
      [
        [
          [121.5, 25],
          [121.501, 25],
        ],
      ],
      [],
    )([25, 121.5001], [25, 121.5002]),
    false,
  );
});
test("connector with no road intersections remains valid", () => {
  assert.equal(
    roadConnectorChecker(
      [
        [
          [121.6, 25],
          [121.601, 25],
        ],
      ],
      [],
    )([25, 121.5001], [25, 121.5002]),
    true,
  );
});
