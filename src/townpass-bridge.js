// 台北通 WebView bridge（taipei-doit/TownPass lib/util/web_message_handler）。
// 訊息格式：postMessage(JSON.stringify({ name, data }))；回覆為 { name, data } 字串。
//
// 本服務用到的 hook：
// - userinfo：回傳整份帳號資料（含身分證字號、姓名、生日、地址）；只取 id 計算雜湊鍵，其他欄位不保存。
// - location：回傳 Position.toJson()，沒有權限時回傳 []。
// - open_link：在台北通另開 WebView 頁面。台北通 WebView 不支援新視窗，target="_blank" 的連結必須改走這裡。不回覆。
// - 1999agree：開啟 1999 語音通報（使用者需先同意條款）。成功時不回覆。
const HOOKS = new Set(["userinfo", "location", "open_link", "1999agree"]);

function bridgeObject() {
  return typeof window === "undefined" ? null : window.flutterObject;
}

export function hasTownPass() {
  return Boolean(bridgeObject()?.postMessage);
}

// 不需要回覆的 hook（open_link、1999agree）：送出就好，不等待。
export function postToTownPass(name, data = null) {
  const bridge = bridgeObject();
  if (!HOOKS.has(name) || !bridge?.postMessage) return false;
  try {
    bridge.postMessage(JSON.stringify({ name, data }));
    return true;
  } catch {
    return false;
  }
}

// 需要回覆的 hook（userinfo、location）：等同名回覆，逾時回傳 null。
export function sendToTownPass(name, data = null, timeoutMs = 4000) {
  const bridge = bridgeObject();
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

// 這個連結在台北通裡要不要改用 open_link 開啟。
export function linkForTownPass(anchor, pageOrigin) {
  const href = anchor?.getAttribute?.("href");
  if (!href || anchor.hasAttribute?.("download")) return null;
  let url;
  try {
    url = new URL(href, pageOrigin);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const external = url.origin !== new URL(pageOrigin).origin;
  return external || anchor.getAttribute("target") === "_blank" ? url.href : null;
}

// 在台北通裡，外部連結與 target="_blank" 改由 open_link 開成新的 WebView 頁面。
export function installTownPassLinks(doc = document) {
  const onClick = (event) => {
    if (!hasTownPass() || event.defaultPrevented || event.button > 0) return;
    const anchor = event.target?.closest?.("a[href]");
    const href = linkForTownPass(anchor, doc.location.href);
    if (!href) return;
    if (postToTownPass("open_link", href)) event.preventDefault();
  };
  doc.addEventListener("click", onClick, true);
  return () => doc.removeEventListener("click", onClick, true);
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
