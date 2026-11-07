// 台北通 WebView bridge。訊息名稱須與台北通 TPWebMessageHandler.name 一致。
const HOOKS = new Set(["userinfo", "location", "phone_call", "1999agree"]);

export function sendToTownPass(name, data = null, timeoutMs = 4000) {
  const bridge = typeof window === "undefined" ? null : window.flutterObject;
  if (!HOOKS.has(name) || !bridge?.postMessage) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    let timer;
    let oldHandler;
    let usingProperty = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (usingProperty && bridge.onmessage === onMessage) bridge.onmessage = oldHandler;
      else bridge.removeEventListener?.("message", onMessage);
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
    if (typeof bridge.addEventListener === "function") bridge.addEventListener("message", onMessage);
    else { oldHandler = bridge.onmessage; usingProperty = true; bridge.onmessage = onMessage; }
    try {
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
