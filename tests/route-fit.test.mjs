import test from "node:test";
import assert from "node:assert/strict";
import { routeFitPadding } from "../src/route-fit.mjs";

const rect = (left, top, width, height) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

test("phone: keeps the route above the half-height bottom sheet", () => {
  // 375x812 phone, nav bar 65px, sheet sits on top of it.
  const pad = routeFitPadding({
    phone: true,
    viewportHeight: 812,
    mapRect: rect(0, 0, 375, 812),
    panelRect: rect(0, 700, 375, 47), // still collapsed while animating
  });
  // sheet top = 747 - 0.56*812 ≈ 292 → bottom padding ≈ 812 - 292 + 24
  assert.equal(pad.paddingBottomRight[1], Math.round(812 - (747 - 812 * 0.56) + 24));
  assert.equal(pad.paddingTopLeft[0], 24);
});

test("phone: a short sheet (content smaller than 56dvh) needs less padding", () => {
  const pad = routeFitPadding({
    phone: true,
    viewportHeight: 812,
    sheetMax: 200,
    mapRect: rect(0, 0, 375, 812),
    panelRect: rect(0, 547, 375, 200),
  });
  assert.equal(pad.paddingBottomRight[1], 812 - 547 + 24);
});

test("phone: always leaves some map visible", () => {
  const pad = routeFitPadding({
    phone: true,
    viewportHeight: 400,
    sheetFraction: 0.95,
    mapRect: rect(0, 0, 375, 400),
    panelRect: rect(0, 0, 375, 400),
  });
  assert.ok(400 - pad.paddingTopLeft[1] - pad.paddingBottomRight[1] >= 140);
});

test("desktop: keeps the route to the right of the floating panel", () => {
  const pad = routeFitPadding({
    phone: false,
    viewportHeight: 768,
    mapRect: rect(0, 0, 1024, 768),
    panelRect: rect(16, 16, 312, 700),
  });
  assert.equal(pad.paddingTopLeft[0], 328 + 24);
  assert.equal(pad.paddingBottomRight[1], 24);
});

test("no measurements: plain padding", () => {
  const pad = routeFitPadding({ phone: false, viewportHeight: 768 });
  assert.deepEqual(pad, { paddingTopLeft: [24, 40], paddingBottomRight: [80, 24] });
});
