// 台北通 WebView bridge。訊息名稱須與台北通 TPWebMessageHandler.name 一致。
const HOOKS = new Set(["userinfo", "location", "phone_call", "launch_map", "1999agree"]);

export function sendToTownPass(name, data = null, timeoutMs = 4000) {
  const bridge = typeof window === "undefined" ? null : window.flutterObject;
  if (!HOOKS.has(name) || !bridge?.postMessage) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    let timer;
    let usingProperty = false;
    let previous;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        if (usingProperty && bridge.onmessage === onMessage) bridge.onmessage = previous;
        else bridge.removeEventListener?.("message", onMessage);
      } catch {
        // Listener cleanup is best-effort.
      }
      resolve(value);
    };
    const onMessage = (event) => {
      try {
        const message = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (message?.name === name) finish(message.data ?? null);
      } catch {
        // Ignore bridge messages for other actions.
      }
    };
    timer = setTimeout(() => finish(null), timeoutMs);
    try {
      if (typeof bridge.addEventListener === "function") bridge.addEventListener("message", onMessage);
      else {
        previous = bridge.onmessage;
        usingProperty = true;
        bridge.onmessage = onMessage;
      }
      bridge.postMessage(JSON.stringify({ name, data }));
    } catch {
      finish(null);
    }
  });
}

export function hasTownPass() {
  return typeof window !== "undefined" && Boolean(window.flutterObject?.postMessage);
}

export async function townPassUserKey() {
  try {
    const user = await sendToTownPass("userinfo", null, 2500);
    const id = user?.id ?? user?.userId;
    if (!id || !globalThis.crypto?.subtle) return null;
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(String(id)),
    );
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return null;
  }
}
