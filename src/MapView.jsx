import { useEffect, useRef } from "react";
import L from "leaflet";
// 讓 Leaflet 地圖可以旋轉（GPL-3.0，與本專案 AGPL-3.0 相容）。固定 0.2.8，0.3 之後是近期才發布的版本。
import "leaflet-rotate";
import { category, cleanName } from "./data";
import { BASEMAPS } from "./basemaps.mjs";
import { TPColors } from "./tp-colors.mjs";
const colors = {
  elevator: TPColors.primary700,
  toilet: TPColors.grayscale700,
  rest: TPColors.secondary800,
  water: TPColors.primary700,
  park: TPColors.primary900,
  ramp: TPColors.primary800,
  station: TPColors.primary700,
  friendly: TPColors.orange700,
  parking: TPColors.grayscale600,
  health: TPColors.red700,
};
// 每個設施都有文字代號，不只靠顏色辨認。
const glyphs = {
  elevator: "梯",
  toilet: "廁",
  "public-toilet": "廁",
  rest: "休",
  water: "水",
  park: "園",
  ramp: "坡",
  station: "站",
  friendly: "店",
  parking: "停",
  bus: "車",
  health: "醫",
};
export default function MapView({
  items,
  route,
  start,
  end,
  location,
  focus,
  pick,
  basemap = "street",
  colorFriendly = false,
  onBasemapStatus,
  onPick,
  onSelect,
  onViewport,
  onMapReady,
  onGesture,
  onBearing,
}) {
  const root = useRef(),
    map = useRef(),
    marks = useRef(),
    path = useRef(),
    ends = useRef();
  const baseLayers = useRef([]);
  const cb = useRef({ onPick, onSelect, onViewport, onGesture, pick, onBearing });
  cb.current = { onPick, onSelect, onViewport, onGesture, pick, onBearing };
  useEffect(() => {
    const m = L.map(root.current, {
      zoomControl: false,
      preferCanvas: true,
      minZoom: 11,
      maxZoom: 19,
      zoomAnimation: !matchMedia("(prefers-reduced-motion: reduce)").matches,
      // 雙指旋轉；電腦上按住 Shift 拖曳旋轉。指南針按鈕在 App 裡，這裡不用套件內建的控制項。
      rotate: true,
      touchRotate: true,
      shiftKeyRotate: true,
      rotateControl: false,
      bearing: 0,
    }).setView([25.0478, 121.517], 15);
    map.current = m;
    // 開發時方便在主控台測試（例如旋轉）；正式建置不含。
    if (import.meta.env.DEV) window.__haohaoMap = m;
    m.attributionControl?.setPrefix(false);
    marks.current = L.layerGroup().addTo(m);
    path.current = L.layerGroup().addTo(m);
    ends.current = L.layerGroup().addTo(m);
    const viewport = () => {
      const b = m.getBounds(),
        c = m.getCenter();
      cb.current.onViewport({
        lat: c.lat,
        lon: c.lng,
        bounds: [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()],
        zoom: m.getZoom(),
      });
    };
    m.on("moveend", viewport);
    m.on("rotate", () => cb.current.onBearing?.(m.getBearing()));
    m.on("click", (e) => {
      if (cb.current.pick)
        cb.current.onPick({
          lat: e.latlng.lat,
          lon: e.latlng.lng,
          name: "地圖上選的位置",
          id: `point-${Date.now()}`,
        });
    });
    // User pan/zoom gestures only (not taps, not fitBounds/setView), so the
    // phone sheet can get out of the way the way Google Maps does.
    const gesture = () => cb.current.onGesture?.();
    const el = root.current;
    const pinch = (e) => e.touches.length > 1 && gesture();
    m.on("dragstart", gesture);
    m.on("dblclick", gesture);
    el.addEventListener("wheel", gesture, { passive: true });
    el.addEventListener("touchstart", pinch, { passive: true });
    viewport();
    onMapReady(m);
    const observer = new ResizeObserver(() => m.invalidateSize({pan:false, debounceMoveend:true}));
    observer.observe(root.current);
    return () => {
      el.removeEventListener("wheel", gesture);
      el.removeEventListener("touchstart", pinch);
      observer.disconnect();
      m.remove();
    };
  }, []);
  useEffect(() => {
    if (!map.current) return;
    const m = map.current,
      spec = BASEMAPS[basemap] || BASEMAPS.street;
    for (const layer of baseLayers.current) layer.remove();
    baseLayers.current = [];
    root.current?.removeAttribute("data-tile-error");
    onBasemapStatus?.("loading");
    let failed = false;
    const base = L.tileLayer(spec.url, {
      maxZoom: 19,
      maxNativeZoom: 19,
      attribution: spec.attribution,
      zIndex: 1,
    });
    base.on("loading", () => {
      failed = false;
      onBasemapStatus?.("loading");
    });
    base.on("tileerror", () => {
      failed = true;
      onBasemapStatus?.("error");
      root.current?.setAttribute("data-tile-error", "true");
    });
    base.on("load", () => {
      if (!failed) {
        root.current?.removeAttribute("data-tile-error");
        onBasemapStatus?.("ready");
      }
    });
    base.addTo(m);
    baseLayers.current.push(base);
    if (spec.overlay) {
      const overlay = L.tileLayer(spec.overlay, {
        maxZoom: 19,
        maxNativeZoom: 19,
        zIndex: 2,
        opacity: 0.85,
      });
      overlay.addTo(m);
      baseLayers.current.push(overlay);
    }
    return () => {
      for (const layer of baseLayers.current) {
        layer.off();
        layer.remove();
      }
      baseLayers.current = [];
    };
  }, [basemap]);
  useEffect(() => {
    if (!marks.current) return;
    marks.current.clearLayers();
    const m = map.current,
      b = m.getBounds();
    const visible = items.filter((p) => b.contains([p.lat, p.lon]));
    const cell = m.getZoom() < 14 ? 110 : m.getZoom() < 17 ? 88 : 60,
      buckets = new Map();
    for (const p of visible) {
      const pos = m.latLngToContainerPoint([p.lat, p.lon]),
        key = `${Math.floor(pos.x / cell)}:${Math.floor(pos.y / cell)}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(p);
    }
    for (const bucket of buckets.values()) {
      const p = bucket[0],
        count = bucket.length,
        color = colorFriendly ? TPColors.primary900 : colors[category(p)] || TPColors.primary700;
      const face = document.createElement("span");
      face.style.setProperty("--pin", color);
      let marker;
      if (count > 1) {
        face.textContent = count;
        marker = L.marker([p.lat, p.lon], {
          icon: L.divIcon({ className: "cluster-pin", html: face, iconSize: null }),
          keyboard: false,
          title: `${count} 個地點，點一下放大`,
        }).addTo(marks.current);
        marker.on("click", () =>
          m.setView([p.lat, p.lon], Math.min(19, m.getZoom() + 2)),
        );
      } else {
        face.textContent = glyphs[category(p)] || "點";
        marker = L.marker([p.lat, p.lon], {
          icon: L.divIcon({
            className: `fac-pin${p.landmark ? " landmark" : ""}`,
            html: face,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          }),
          keyboard: false,
        }).addTo(marks.current);
        const tip = document.createElement("span");
        tip.textContent = cleanName(p.name);
        marker.bindTooltip(tip, { direction: "top", offset: [0, -14] });
        marker.on("click", (ev) => {
          L.DomEvent.stopPropagation(ev);
          if (cb.current.pick) cb.current.onPick(p);
          else cb.current.onSelect(p);
        });
      }
    }
  }, [items, focus, colorFriendly]);
  useEffect(() => {
    if (!path.current) return;
    path.current.clearLayers();
    if (route?.coordinates) {
      L.polyline(route.coordinates, {
        color: TPColors.white,
        weight: 10,
        opacity: 1,
      }).addTo(path.current);
      L.polyline(route.coordinates, {
        color: TPColors.primary700,
        weight: 6,
        opacity: 1,
        lineCap: "round",
        dashArray: route.requiresEntryConfirmation ? "8 6" : undefined,
      }).addTo(path.current);
      map.current.fitBounds(L.latLngBounds(route.coordinates).pad(0.2));
    }
  }, [route]);
  useEffect(() => {
    if (!ends.current) return;
    ends.current.clearLayers();
    if (location) {
      const marker = L.circleMarker([location.lat, location.lon], {
        radius: 7,
        color: TPColors.white,
        weight: 3,
        fillColor: TPColors.red500,
        fillOpacity: 1,
      }).addTo(ends.current);
      marker.bindTooltip("目前位置", { direction: "top" });
    }
    [start, end].forEach((p, i) => {
      if (!p) return;
      const marker = L.marker([p.lat, p.lon], {
        icon: L.divIcon({
          className: "endpoint",
          html: `<span class="${i ? "destination" : "origin"}">${i ? "終" : "起"}</span>`,
          iconSize: [32, 40],
          iconAnchor: [16, 38],
        }),
      }).addTo(ends.current);
      const el = document.createElement("span");
      el.textContent = p.name;
      marker.bindTooltip(el);
    });
    if (route?.requiresEntryConfirmation) {
      [route.coordinates[0], route.coordinates.at(-1)].forEach((p, i) => {
        const text = i ? "路線終點" : "路線起點";
        L.marker(p, {
          icon: L.divIcon({
            className: "route-entry-marker",
            html: `<span>${text}</span>`,
            iconSize: [72, 28],
            iconAnchor: [36, 14],
          }),
        }).addTo(ends.current);
      });
    }
  }, [start, end, route, location]);
  useEffect(() => {
    if (focus?.lat && map.current)
      map.current.setView([focus.lat, focus.lon], focus.zoom || 17);
  }, [focus?.token]);
  return (
    <div
      ref={root}
      className={`map-canvas basemap-${basemap} ${pick ? "picking" : ""}`}
      role="region"
      aria-label="臺北地圖，可使用方向鍵移動，加減鍵縮放。"
    />
  );
}
