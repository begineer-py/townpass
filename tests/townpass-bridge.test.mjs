import test from "node:test";
import assert from "node:assert/strict";
import { linkForTownPass, postToTownPass, sendToTownPass } from "../src/townpass-bridge.js";

function fakeBridge(reply) {
  const listeners = new Set();
  const sent = [];
  return {
    sent,
    listeners,
    postMessage(text) {
      sent.push(JSON.parse(text));
      const answer = reply?.(JSON.parse(text));
      if (answer) setTimeout(() => listeners.forEach((fn) => fn({ data: JSON.stringify(answer) })), 0);
    },
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
  };
}

function anchor(href, target) {
  const attrs = { href, ...(target ? { target } : {}) };
  return { getAttribute: (k) => attrs[k] ?? null, hasAttribute: (k) => k in attrs };
}

test("messages use the Town Pass handler names and JSON shape", () => {
  const bridge = fakeBridge();
  globalThis.window = { flutterObject: bridge };
  assert.equal(postToTownPass("1999agree", true), true);
  assert.equal(postToTownPass("open_link", "https://www.metro.taipei/"), true);
  assert.deepEqual(bridge.sent, [
    { name: "1999agree", data: true },
    { name: "open_link", data: "https://www.metro.taipei/" },
  ]);
});

test("hooks this service does not use are not sent", async () => {
  const bridge = fakeBridge((m) => ({ name: m.name, data: true }));
  globalThis.window = { flutterObject: bridge };
  assert.equal(postToTownPass("agree1999", true), false);
  assert.equal(await sendToTownPass("launch_map", "https://example.com"), null);
  assert.equal(await sendToTownPass("phone_call", "1999"), null);
  assert.equal(bridge.sent.length, 0);
});

test("location replies are matched by name and listeners are removed", async () => {
  const bridge = fakeBridge(() => ({ name: "location", data: { latitude: 25.04, longitude: 121.51 } }));
  globalThis.window = { flutterObject: bridge };
  assert.deepEqual(await sendToTownPass("location"), { latitude: 25.04, longitude: 121.51 });
  assert.equal(bridge.listeners.size, 0);
});

test("location without permission replies an empty list", async () => {
  const bridge = fakeBridge(() => ({ name: "location", data: [] }));
  globalThis.window = { flutterObject: bridge };
  const reply = await sendToTownPass("location");
  assert.ok(!Number.isFinite(reply?.latitude));
});

test("without Town Pass nothing is sent", async () => {
  globalThis.window = {};
  assert.equal(postToTownPass("open_link", "https://example.com"), false);
  assert.equal(await sendToTownPass("location"), null);
});

test("external and new-window links open through open_link", () => {
  const page = "https://haohao.example/";
  assert.equal(linkForTownPass(anchor("https://www.openstreetmap.org/copyright"), page), "https://www.openstreetmap.org/copyright");
  assert.equal(linkForTownPass(anchor("/about.html", "_blank"), page), "https://haohao.example/about.html");
  assert.equal(linkForTownPass(anchor("#main"), page), null);
  assert.equal(linkForTownPass(anchor("tel:1999"), page), null);
  assert.equal(linkForTownPass(anchor("/data/sources.json"), page), null);
});

test("location failures explain the cause", async () => {
  const { getLocation, locationErrorText } = await import("../src/location.js");
  globalThis.window = {};
  globalThis.isSecureContext = false;
  await assert.rejects(getLocation(), (e) => /HTTPS/.test(locationErrorText(e)));
  globalThis.isSecureContext = true;
  assert.match(locationErrorText({ code: 1 }), /權限/);
  assert.match(locationErrorText({ code: 2 }), /定位服務/);
  assert.match(locationErrorText({ code: 3 }), /逾時/);
});

test("browser location comes first; Town Pass location is the fallback", async () => {
  const { getLocation } = await import("../src/location.js");
  const bridge = fakeBridge(() => ({ name: "location", data: { latitude: 25.05, longitude: 121.52, accuracy: 8 } }));
  globalThis.isSecureContext = true;
  globalThis.window = { flutterObject: bridge };
  const geo = { getCurrentPosition: (ok) => ok({ coords: { latitude: 25.03, longitude: 121.56, accuracy: 20 } }) };
  Object.defineProperty(globalThis, "navigator", { value: { geolocation: geo }, configurable: true });
  assert.equal((await getLocation()).lat, 25.03);
  assert.equal(bridge.sent.length, 0);

  geo.getCurrentPosition = (_, fail) => fail({ code: 1 });
  assert.equal((await getLocation()).lat, 25.05);
  assert.deepEqual(bridge.sent, [{ name: "location", data: null }]);

  globalThis.window = {};
  await assert.rejects(getLocation(), (e) => e.code === 1);
});
