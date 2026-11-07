import test from "node:test";
import assert from "node:assert/strict";
import { sendToTownPass } from "../src/townpass-bridge.js";

function fakeBridge(reply) {
  const listeners = new Set();
  const sent = [];
  return {
    sent,
    listeners,
    postMessage(text) {
      sent.push(JSON.parse(text));
      setTimeout(() => listeners.forEach((fn) => fn({ data: JSON.stringify(reply(JSON.parse(text))) })), 0);
    },
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
  };
}

test("1999 uses the Town Pass handler name 1999agree", async () => {
  const bridge = fakeBridge((m) => ({ name: m.name, data: true }));
  globalThis.window = { flutterObject: bridge };
  assert.equal(await sendToTownPass("1999agree", true), true);
  assert.deepEqual(bridge.sent, [{ name: "1999agree", data: true }]);
  assert.equal(bridge.listeners.size, 0);
});

test("unknown hooks and the old agree1999 name are not sent", async () => {
  const bridge = fakeBridge((m) => ({ name: m.name, data: true }));
  globalThis.window = { flutterObject: bridge };
  assert.equal(await sendToTownPass("agree1999", true), null);
  assert.equal(await sendToTownPass("launch_map", "https://example.com"), null);
  assert.equal(bridge.sent.length, 0);
});

test("location replies are matched by name", async () => {
  const bridge = fakeBridge(() => ({ name: "location", data: { latitude: 25.04, longitude: 121.51 } }));
  globalThis.window = { flutterObject: bridge };
  assert.deepEqual(await sendToTownPass("location"), { latitude: 25.04, longitude: 121.51 });
});

test("without Town Pass the bridge resolves to null", async () => {
  globalThis.window = {};
  assert.equal(await sendToTownPass("location"), null);
});
