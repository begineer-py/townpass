import { sendToTownPass } from "./townpass-bridge.js";

// 在台北通內先用 App 的定位（訊息 location），取不到時改用瀏覽器定位。
export async function getLocation() {
  const bridged = await sendToTownPass("location");
  if (Number.isFinite(bridged?.latitude) && Number.isFinite(bridged?.longitude)) {
    return {
      lat: bridged.latitude,
      lon: bridged.longitude,
      name: "我的位置",
      id: "my-location",
      accuracy: bridged.accuracy,
    };
  }
  return new Promise((resolve, reject) => {
    // http://192.168.x.x 這類非 HTTPS 網址，瀏覽器會直接封鎖定位，也不會詢問。
    if (globalThis.isSecureContext === false) return reject(Error("insecure"));
    if (!navigator.geolocation) return reject(Error("unsupported"));
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          name: "我的位置",
          id: "my-location",
          accuracy: p.coords.accuracy,
        }),
      reject,
      { timeout: 15000, maximumAge: 60000, enableHighAccuracy: true },
    );
  });
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
