export function getLocation() {
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
