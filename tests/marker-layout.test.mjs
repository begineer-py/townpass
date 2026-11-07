import test from "node:test";
import assert from "node:assert/strict";
import { focusOffsetForInset, groupMarkers, metroExitLabelForAccessibility, selectMapMarkers } from "../src/marker-layout.mjs";

test("overlapping and identical facilities remain selectable without moving markers", () => {
  const points = [
    { x: 14, y: 14 }, { x: 14, y: 14 }, { x: 31, y: 14 },
    ...Array.from({ length: 20 }, () => ({ x: 14, y: 14 })),
    { x: 100, y: 40 },
  ];
  const groups = groupMarkers(points);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].points.length, points.length - 1);
  assert.deepEqual(groups.flatMap((group) => group.points), points);
  for (const group of groups) {
    assert.equal(group.x, group.points[0].x);
    assert.equal(group.y, group.points[0].y);
    for (const point of group.points) {
      assert.ok(Math.abs(group.x - point.x) < 28 && Math.abs(group.y - point.y) < 28);
    }
  }
});

test("facilities on opposite sides of a cell boundary are grouped", () => {
  const groups = groupMarkers([{ x: 27, y: 0 }, { x: 29, y: 0 }, { x: 57, y: 0 }]);
  assert.deepEqual(groups.map((group) => group.points.length), [2, 1]);
});

test("overview shows station bodies, curated landmarks and history at zoom 13 and 15", () => {
  const station = { id: "station", kind: "20", lat: 25, lon: 121 };
  const landmark = { id: "landmark", kind: "place", landmark: true, lat: 25, lon: 121 };
  const exit = { id: "exit", kind: "metro-elevator", lat: 25, lon: 121 };
  const bus = { id: "bus", kind: "18", lat: 25, lon: 121 };
  const history = { id: "history", lat: 25, lon: 121, name: "曾選的地點" };
  for (const zoom of [13, 15]) {
    assert.deepEqual(selectMapMarkers([station, landmark, exit, bus], [history, station], zoom), [station, landmark, history]);
  }
  assert.deepEqual(selectMapMarkers([station, landmark, exit, bus], [history, station], 17), [station, exit, landmark, bus, history]);
});

test("history can be shown without facility data and invalid coordinates are ignored", () => {
  const history = { name: "曾選的地點", lat: 25, lon: 121 };
  assert.deepEqual(selectMapMarkers([], [history, history, { lat: NaN, lon: 121 }], 13), [history]);
});

test("focused places stay above the bottom drawer", () => {
  assert.equal(focusOffsetForInset(844, 500), 250);
  assert.equal(focusOffsetForInset(844, 0), 0);
  assert.equal(focusOffsetForInset(844, 1000), 362);
});

test("unknown elevator status is never presented as no elevator", () => {
  assert.equal(metroExitLabelForAccessibility({ elevator: true }), "捷運出入口（有電梯）");
  assert.equal(metroExitLabelForAccessibility({ elevator: null }), "捷運出入口");
  assert.equal(metroExitLabelForAccessibility({}), "捷運出入口");
  assert.equal(metroExitLabelForAccessibility({ elevator: false }), "捷運出入口");
});

test("general metro exits appear after zooming in", () => {
  const exit = { id: "general-exit", kind: "metro-exit", lat: 25, lon: 121, stationCode: "R12", elevator: null };
  assert.deepEqual(selectMapMarkers([exit], [], 15), []);
  assert.deepEqual(selectMapMarkers([exit], [], 17), [exit]);
});

test("official exit is placed ahead of duplicate older elevator markers", () => {
  const old = { id: "legacy", kind: "metro-elevator", lat: 25, lon: 121 };
  const official = { id: "official", kind: "metro-exit", lat: 25, lon: 121, stationCode: "R12", elevator: true };
  assert.deepEqual(selectMapMarkers([old, official], [], 17), [official, old]);
});

test("at street scale nearby official exits take priority over the station body", () => {
  const station = { id: "station", kind: "20", lat: 25, lon: 121, x: 15, y: 0 };
  const exit1 = { id: "exit1", kind: "metro-exit", lat: 25, lon: 121, x: 0, y: 0 };
  const exit2 = { id: "exit2", kind: "metro-exit", lat: 25, lon: 121, x: 32, y: 0 };
  const groups = groupMarkers(selectMapMarkers([station, exit1, exit2], [], 17), 29);
  assert.deepEqual(groups.map((group) => group.points[0].id), ["exit1", "exit2"]);
  assert.deepEqual(groups.flatMap((group) => group.points).map((point) => point.id).sort(), ["exit1", "exit2", "station"]);
});
