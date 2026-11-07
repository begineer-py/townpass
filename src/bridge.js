const HOOKS = new Set([
  "userinfo",
  "location",
  "launch_map",
  "phone_call",
  "agree1999",
]);

export function sendToTownPass(name, data = null, timeout = 4000) {
  return new Promise((resolve) => {
    if (!HOOKS.has(name)) {
      resolve(null);
      return;
    }
    const bridge = window.flutterObject;
    if (!bridge?.postMessage) {
      resolve(null);
      return;
    }
    const timer = setTimeout(done, timeout, null);
    const handler = (event) => {
      try {
        const parsed =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (parsed?.name === name) done(parsed.data ?? null);
      } catch {
        /* unrelated message */
      }
    };
    function done(value) {
      clearTimeout(timer);
      bridge.removeEventListener?.("message", handler);
      resolve(value);
    }
    bridge.addEventListener?.("message", handler);
    bridge.postMessage(JSON.stringify({ name, data }));
  });
}
