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
const shiftLat = metres => metres / 111195;
test('small boundary error may match a crossing of the same road and is reported as approximate', () => {
 const road=[[[121.5,24.9999],[121.5,25.0001]]],crossing=polygon([box(121.49999,25+shiftLat(.2),121.50001,25+shiftLat(2))]);
 const a=[25,121.49999],b=[25,121.50001];
 assert.equal(roadConnectorChecker(road,[crossing])(a,b),false);
 const check=roadConnectorChecker(road,[crossing],{crossingToleranceMetres:.25});
 assert.deepEqual(check.inspect(a,b),{allowed:true,crossing:true,approximateCrossing:true});
 assert.equal(check(a,b),true);
 assert.equal(roadConnectorChecker(road,[crossing],{crossingToleranceMetres:.1})(a,b),false);
});
test('crossing tolerance does not match a polygon on a different parallel road or a polygon hole',()=>{
 const road=[[[121.5,24.9999],[121.5,25.0001]]],a=[25,121.49999],b=[25,121.50001];
 const other=polygon([box(121.500001,25-shiftLat(1),121.50001,25+shiftLat(1))]);
 const hole=polygon([box(121.49999,25-shiftLat(2),121.50001,25+shiftLat(2)),box(121.499998,25-shiftLat(1),121.500002,25+shiftLat(1))]);
 assert.equal(roadConnectorChecker(road,[other],{crossingToleranceMetres:.25})(a,b),false);
 assert.equal(roadConnectorChecker(road,[hole],{crossingToleranceMetres:.25})(a,b),false);
});
test('tolerance never covers zero-length points or centreline overlap',()=>{
 const road=[[[121.5,24.9999],[121.5,25.0001]]],crossing=polygon([box(121.49999,25+shiftLat(.2),121.50001,25+shiftLat(2))]);
 const check=roadConnectorChecker(road,[crossing],{crossingToleranceMetres:.25});
 assert.equal(check([25,121.5],[25,121.5]),false);
 assert.equal(check([25,121.5],[25+shiftLat(1),121.5]),false);
 assert.throws(()=>roadConnectorChecker(road,[crossing],{crossingToleranceMetres:.251}),RangeError);
});
test('exact intersection is not marked approximate and a second unprotected road still fails',()=>{
 const road=[[[121.5,24.9999],[121.5,25.0001]]], crossing=polygon([box(121.49999,25-shiftLat(1),121.50001,25+shiftLat(1))]);
 const check=roadConnectorChecker(road,[crossing],{crossingToleranceMetres:.25});
 assert.deepEqual(check.inspect([25,121.49999],[25,121.50001]),{allowed:true,crossing:true,approximateCrossing:false});
 const second=[...road,[[121.50002,24.9999],[121.50002,25.0001]]];
 assert.equal(roadConnectorChecker(second,[crossing],{crossingToleranceMetres:.25})([25,121.49999],[25,121.50003]),false);
});

test('strict and tolerant variants share road index without weakening strict connector checks',()=>{
 const road=[[[121.5,24.9999],[121.5,25.0001]]],crossing=polygon([box(121.49999,25+shiftLat(.2),121.50001,25+shiftLat(2))]);
 const a=[25,121.49999],b=[25,121.50001],strict=roadConnectorChecker(road,[crossing]);
 const tolerant=strict.withCrossingTolerance(.25);
 assert.equal(strict(a,b),false);assert.equal(tolerant(a,b),true);
 assert.deepEqual(tolerant.inspect(a,b),{allowed:true,crossing:true,approximateCrossing:true});
 assert.equal(strict(a,b),false);assert.equal(strict.withCrossingTolerance(.25),tolerant);
 assert.equal(strict.withCrossingTolerance(0)(a,b),false);
 assert.throws(()=>strict.withCrossingTolerance(.251),RangeError);
});
