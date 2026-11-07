import { sendToTownPass } from "./townpass-bridge.js";

const place = (lat, lon, accuracy) => ({
  lat,
  lon,
  name: "我的位置",
  id: "my-location",
  accuracy,
});

// 瀏覽器定位（標準 Geolocation API）。
export function browserLocation() {
  return new Promise((resolve, reject) => {
    // http://192.168.x.x 這類非 HTTPS 網址，瀏覽器會直接封鎖定位，也不會詢問。
    if (globalThis.isSecureContext === false) return reject(Error("insecure"));
    if (!globalThis.navigator?.geolocation) return reject(Error("unsupported"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(place(p.coords.latitude, p.coords.longitude, p.coords.accuracy)),
      reject,
      { timeout: 15000, maximumAge: 60000, enableHighAccuracy: true },
    );
  });
}

// 台北通定位（hook：location）。不在台北通、沒有權限或逾時都回傳 null。
export async function townPassLocation() {
  const p = await sendToTownPass("location");
  return Number.isFinite(p?.latitude) && Number.isFinite(p?.longitude)
    ? place(p.latitude, p.longitude, p.accuracy)
    : null;
}

// 開發用的假位置：只在 npm run dev 時有效，正式建置會移除。
// 用法：網址加上 ?devLocation=25.0478,121.5170
// （Claude 桌面版內建瀏覽器會自動拒絕定位，用這個在裡面測試定位流程。）
export function devLocation(search = globalThis.location?.search) {
  if (!import.meta.env?.DEV || !search) return null;
  const value = new URLSearchParams(search).get("devLocation");
  const [lat, lon] = String(value || "").split(",").map(Number);
  return Number.isFinite(lat) && Number.isFinite(lon) ? place(lat, lon, 5) : null;
}

// 先用瀏覽器定位；失敗時，在台北通裡改用 App 的定位。兩邊都失敗時，回報瀏覽器的失敗原因。
export async function getLocation() {
  const fake = devLocation();
  if (fake) return fake;
  try {
    return await browserLocation();
  } catch (error) {
    const fromApp = await townPassLocation();
    if (fromApp) return fromApp;
    throw error;
  }
}

// 定位失敗原因轉成給使用者看的說明。
export function locationErrorText(error) {
  if (error?.message === "insecure")
    return "這個網址不是 HTTPS，瀏覽器不允許定位。請改用 https 網址或在電腦上用 localhost 開啟；也可以搜尋地點，或在地圖上選擇。";
  if (error?.message === "unsupported")
    return "這個瀏覽器不支援定位。你仍可以搜尋地點，或在地圖上選擇。";
  if (error?.code === 1)
    return "沒有定位權限。請在瀏覽器或手機設定允許這個網站使用位置；也可以搜尋地點，或在地圖上選擇。";
  if (error?.code === 2)
    return "裝置目前取不到位置，請確認已開啟定位服務。你仍可以搜尋地點，或在地圖上選擇。";
  if (error?.code === 3)
    return "定位逾時，請到訊號較好的地方再試一次，或搜尋地點、在地圖上選擇。";
  return "目前無法取得位置。你仍可以搜尋地點，或在地圖上選擇。";
}
