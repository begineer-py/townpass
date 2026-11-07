function requestUserInfo(timeoutMs = 2500) {
  const bridge = window.flutterObject;
  if (!bridge?.postMessage || !bridge?.addEventListener) return Promise.resolve(null);

  return new Promise((resolve) => {
    let settled = false;
    let timer;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      bridge.removeEventListener?.("message", onMessage);
      resolve(value);
    };
    const onMessage = (event) => {
      try {
        const message = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (message?.name === "userinfo") finish(message.data || null);
      } catch {
        // Ignore bridge messages for other actions.
      }
    };
    timer = setTimeout(() => finish(null), timeoutMs);
    bridge.addEventListener("message", onMessage);
    try {
      bridge.postMessage(JSON.stringify({ name: "userinfo", data: null }));
    } catch {
      finish(null);
    }
  });
}

export async function townPassUserKey() {
  try {
    const user = await requestUserInfo();
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
