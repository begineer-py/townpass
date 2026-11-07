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
