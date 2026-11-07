export function getLocation() {
  if (window.flutterObject?.postMessage)
    return new Promise((resolve, reject) => {
      const bridge = window.flutterObject;
      let timer;
      const done = (err, value) => {
        clearTimeout(timer);
        bridge.removeEventListener?.("message", listener);
        if (!bridge.removeEventListener && bridge.onmessage === listener)
          bridge.onmessage = null;
        err ? reject(err) : resolve(value);
      };
      const listener = (event) => {
        try {
          const r = JSON.parse(event.data);
          if (r.name !== "location") return;
          const d = r.data;
          if (!Number.isFinite(d?.latitude) || !Number.isFinite(d?.longitude))
            return done(Error("permission"));
          done(null, {
            lat: d.latitude,
            lon: d.longitude,
            name: "我的位置",
            id: "my-location",
            accuracy: d.accuracy,
          });
        } catch {
          done(Error("invalid"));
        }
      };
      timer = setTimeout(() => done(Error("timeout")), 15000);
      if (bridge.addEventListener) bridge.addEventListener("message", listener);
      else bridge.onmessage = listener;
      bridge.postMessage(JSON.stringify({ name: "location", data: null }));
    });
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
