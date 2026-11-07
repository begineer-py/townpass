import { useEffect, useRef } from "react";
import L from "leaflet";
// 讓 Leaflet 地圖可以旋轉（GPL-3.0，與本專案 AGPL-3.0 相容）。固定 0.2.8，0.3 之後是近期才發布的版本。
import "leaflet-rotate";
import { category, cleanName } from "./data";
import { BASEMAPS } from "./basemaps.mjs";
import { metroExitIconUrl, metroExitLabel } from "./metro-exits.mjs";
import {
  loadOfficialSidewalks,
  loadSidewalkIssues,
  OFFICIAL_SIDEWALK_SOURCE,
  visibleSidewalkIssues,
  visibleSidewalkLines,
} from "./official-sidewalks.mjs";
import { TPColors } from "./tp-colors.mjs";
import { mapIconElement } from "./map-icons.mjs";
// 標記底色（白色圖形放在上面，與白色的對比都在 3:1 以上）。
const colors = {
  place: TPColors.orange700,
  bus: TPColors.primary900,
  entrance: TPColors.grayscale700,
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
// 每種地點用不同圖形（Lucide），不只靠顏色辨認。
const iconKind = (k) =>
  ({ place: "store", "public-toilet": "toilet" })[k] || k;
// 標記（圖形＋店名）隨縮放一起變大變小：縮放 18 為原尺寸，最小 0.9 倍免得太難點。
const pinScale = (z) => Math.min(1.15, Math.max(0.9, 1 + (z - 18) * 0.13));
// 店家與地標在圖形下方顯示名稱。
const hasLabel = (p) =>
  p.landmark || ["place", "friendly"].includes(category(p));
// 估計名稱寬度（11px 字，中文一字一格，英數約半格），最多約 9 個字寬後截斷。
const labelWidth = (name) =>
  Math.min(
    99,
    [...name].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? 11 : 6.5), 0),
  ) + 4;
export default function MapView({
  items,
  route,
  start,
  end,
  location,
  focus,
  pick,
  basemap = "street",
  showOfficialSidewalk = false,
  colorFriendly = false,
  onBasemapStatus,
  onOfficialSidewalkStatus,
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
    const scale = (z) =>
      root.current?.style.setProperty("--pin-scale", pinScale(z).toFixed(3));
    scale(m.getZoom());
    // zoomanim 帶目標縮放，標記和地圖同時開始變大小（CSS 有 transition）。
    m.on("zoomanim", (e) => scale(e.zoom));
    m.on("zoomend", () => scale(m.getZoom()));
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
    const watch = (layer) => {
      layer.on("loading", () => {
        failed = false;
        onBasemapStatus?.("loading");
      });
      layer.on("tileerror", () => {
        failed = true;
        onBasemapStatus?.("error");
        root.current?.setAttribute("data-tile-error", "true");
      });
      layer.on("load", () => {
        if (!failed) {
          root.current?.removeAttribute("data-tile-error");
          onBasemapStatus?.("ready");
        }
      });
      layer.addTo(m);
      baseLayers.current.push(layer);
    };
    // spec.close：放大到 minZoom 以上改用另一組圖磚（例如不印店名的底圖）。
    const close = spec.close;
    watch(
      L.tileLayer(spec.url, {
        maxZoom: close ? close.minZoom - 1 : 19,
        maxNativeZoom: 19,
        attribution: spec.attribution,
        zIndex: 1,
      }),
    );
    if (close) {
      watch(
        L.tileLayer(close.url, {
          minZoom: close.minZoom,
          maxZoom: 19,
          maxNativeZoom: 19,
          attribution: close.attribution,
          zIndex: 1,
        }),
      );
      if (close.overlay) {
        const roads = L.tileLayer(close.overlay, {
          minZoom: close.minZoom,
          maxZoom: 19,
          maxNativeZoom: 19,
          zIndex: 2,
        });
        roads.addTo(m);
        baseLayers.current.push(roads);
      }
    }
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
    if (!map.current) return;
    if (!showOfficialSidewalk) {
      onOfficialSidewalkStatus?.("idle");
      return;
    }
    const m = map.current;
    const pane =
      m.getPane("official-sidewalks") ||
      // 地圖可旋轉時，底圖在 rotatePane（z-index 400）裡；通行線也要放進同一層，
      // 否則會被底圖蓋住，且不會跟著地圖旋轉。
      m.createPane("official-sidewalks", m.getPane("rotatePane") || undefined);
    pane.style.zIndex = "350";
    pane.style.pointerEvents = "none";
    const renderer = L.canvas({ pane: "official-sidewalks", padding: 0.25 });
    let active = true;
    let features;
    let issues;
    let drawing;
    const clear = () => {
      drawing?.remove();
      drawing = null;
    };
    const draw = () => {
      if (!active || !features) return;
      clear();
      if (m.getZoom() < 14) {
        onOfficialSidewalkStatus?.("zoom");
        return;
      }
      const lines = visibleSidewalkLines(features, m.getBounds());
      const halo = L.polyline(lines, {
        renderer,
        pane: "official-sidewalks",
        color: TPColors.white,
        weight: 6,
        opacity: 0.9,
        interactive: false,
      });
      const official = L.polyline(lines, {
        renderer,
        pane: "official-sidewalks",
        color: TPColors.orange700,
        weight: 3,
        opacity: 0.92,
        interactive: false,
      });
      drawing = L.layerGroup([halo, official]);
      // 不利通行點位跟人行道同一個圖層：放大到 16 以上才畫，免得整片紅點。
      // 不利通行（沒有路緣斜坡）為實心紅點；行穿線未設置路緣斜坡為空心紅圈，形狀不同不只靠顏色。
      if (issues && m.getZoom() >= 16) {
        const r = m.getZoom() >= 18 ? 5.5 : 4.5;
        for (const { lat, lon, kind } of visibleSidewalkIssues(issues, m.getBounds())) {
          const crosswalk = kind === 3;
          L.circleMarker([lat, lon], {
            renderer,
            pane: "official-sidewalks",
            radius: r,
            color: crosswalk ? TPColors.red600 : TPColors.white,
            weight: crosswalk ? 2.5 : 1.5,
            fillColor: crosswalk ? TPColors.white : TPColors.red600,
            fillOpacity: 1,
            interactive: false,
          }).addTo(drawing);
        }
      }
      drawing.getAttribution = () =>
        `無障礙通行線 © <a href="${OFFICIAL_SIDEWALK_SOURCE}" target="_blank" rel="noopener">臺北市政府</a>`;
      drawing.addTo(m);
      onOfficialSidewalkStatus?.("ready");
    };
    onOfficialSidewalkStatus?.("loading");
    // 不利通行點位載入失敗時，人行道照常顯示。
    loadSidewalkIssues()
      .then((result) => {
        if (!active) return;
        issues = result;
        draw();
      })
      .catch(() => {});
    loadOfficialSidewalks()
      .then((result) => {
        if (!active) return;
        features = result;
        draw();
        m.on("moveend", draw);
      })
      .catch(() => {
        if (active) onOfficialSidewalkStatus?.("error");
      });
    return () => {
      active = false;
      m.off("moveend", draw);
      clear();
      renderer.remove();
    };
  }, [showOfficialSidewalk]);
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
        key =
          p.kind === "metro-elevator"
            ? `metro-exit:${p.id}`
            : p.landmark
              ? `landmark:${p.id}`
            : `${Math.floor(pos.x / cell)}:${Math.floor(pos.y / cell)}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(p);
    }
    // 名稱互相重疊、或蓋到別的標記時就不顯示：地標優先，其次離畫面中心近的。
    const s = pinScale(m.getZoom()),
      size = m.getSize(),
      boxes = [],
      labelled = new Set();
    const overlaps = (r) =>
      boxes.some(
        (b) => r.x0 < b.x1 && r.x1 > b.x0 && r.y0 < b.y1 && r.y1 > b.y0,
      );
    const pins = [...buckets.values()].map((bucket) => ({
      p: bucket[0],
      single: bucket.length === 1,
      pos: m.latLngToContainerPoint([bucket[0].lat, bucket[0].lon]),
    }));
    for (const { pos } of pins) {
      const r = 15 * s;
      boxes.push({ x0: pos.x - r, x1: pos.x + r, y0: pos.y - r, y1: pos.y + r });
    }
    pins
      .filter(({ p, single }) => single && hasLabel(p) && cleanName(p.name))
      .sort(
        (a, b) =>
          !!b.p.landmark - !!a.p.landmark ||
          Math.hypot(a.pos.x - size.x / 2, a.pos.y - size.y / 2) -
            Math.hypot(b.pos.x - size.x / 2, b.pos.y - size.y / 2),
      )
      .forEach(({ p, pos }) => {
        const half = (labelWidth(cleanName(p.name)) * s) / 2,
          top = pos.y + (p.landmark ? 17 : 15) * s;
        const r = { x0: pos.x - half, x1: pos.x + half, y0: top, y1: top + 15 * s };
        if (overlaps(r)) return;
        boxes.push(r);
        labelled.add(p);
      });
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
        if (p.kind === "metro-elevator")
          face.classList.add("metro-exit-face");
        const exitIcon = p.kind === "metro-elevator" ? metroExitIconUrl(p) : "";
        if (exitIcon) {
          face.classList.add("has-exit-icon");
          const img = document.createElement("img");
          img.src = exitIcon;
          img.alt = "";
          face.appendChild(img);
        } else if (p.kind === "metro-elevator" && metroExitLabel(p) !== "梯") {
          face.textContent = metroExitLabel(p);
        } else if (p.kind === "metro-elevator") {
          face.classList.add("has-glyph");
          face.appendChild(mapIconElement("elevator", 16));
        } else {
          face.classList.add("has-glyph");
          face.appendChild(mapIconElement(iconKind(category(p)), 16));
        }
        // 圖形和名稱包在同一個元素裡，一起縮放。名稱用 div，避免套到 .fac-pin span 的圓點樣式。
        const body = document.createElement("div");
        body.className = "pin-body";
        body.appendChild(face);
        const showLabel = labelled.has(p);
        if (showLabel) {
          const label = document.createElement("div");
          label.className = "pin-label";
          label.textContent = cleanName(p.name);
          body.appendChild(label);
        }
        marker = L.marker([p.lat, p.lon], {
          icon: L.divIcon({
            className:
              p.kind === "metro-elevator"
                ? "fac-pin metro-exit-pin"
                : p.landmark
                  ? "fac-pin landmark"
                  : "fac-pin",
            html: body,
            iconSize: p.landmark ? [32, 32] : [28, 28],
            iconAnchor: p.landmark ? [16, 16] : [14, 14],
          }),
          keyboard: false,
        }).addTo(marks.current);
        // 名稱已經顯示在地圖上就不再用滑鼠提示重複一次。
        if (!showLabel) {
          const tip = document.createElement("span");
          tip.textContent = cleanName(p.name);
          marker.bindTooltip(tip, { direction: "top", offset: [0, -14] });
        }
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
      for (const [index, step] of (route.steps || []).entries()) {
        if (!Number.isFinite(step.lat) || !Number.isFinite(step.lon)) continue;
        const marker = L.marker([step.lat, step.lon], {
          icon: L.divIcon({
            className: "route-step-pin",
            html: `<span>${index + 1}</span>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          }),
          keyboard: false,
        }).addTo(path.current);
        const label = document.createElement("span");
        label.textContent = `第 ${index + 1} 段：${cleanName(step.name) || step.turn || "繼續前進"}`;
        marker.bindTooltip(label, { direction: "top" });
      }
      for (const stair of route.avoidedStairs || []) {
        if (!Number.isFinite(stair.lat) || !Number.isFinite(stair.lon)) continue;
        const marker = L.circleMarker([stair.lat, stair.lon], {
          radius: 8,
          color: TPColors.white,
          weight: 3,
          fillColor: TPColors.orange700,
          fillOpacity: 1,
        }).addTo(path.current);
        const label = document.createElement("span");
        label.textContent = `已避開階梯：${cleanName(stair.name)}`;
        marker.bindTooltip(label, { direction: "top" });
      }
      for (const work of route.construction?.avoidedWorks || []) {
        const geometry = work.geometry;
        if (!geometry?.coordinates?.length) continue;
        let layer;
        if (geometry.type === "Point")
          layer = L.circleMarker(geometry.coordinates[0], {
            radius: 9,
            color: TPColors.white,
            weight: 3,
            fillColor: TPColors.red700,
            fillOpacity: 1,
          });
        else if (geometry.type === "Polygon")
          layer = L.polygon(geometry.coordinates, {
            color: TPColors.red700,
            weight: 3,
            dashArray: "6 5",
            fillColor: TPColors.red500,
            fillOpacity: 0.18,
          });
        else
          layer = L.polyline(geometry.coordinates, {
            color: TPColors.red700,
            weight: 4,
            dashArray: "6 5",
          });
        layer.addTo(path.current);
        const label = document.createElement("span");
        label.textContent = `已避開施工：${work.address}`;
        layer.bindTooltip(label, { direction: "top" });
      }
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
      // 起點、終點用圖形（起點圓點、終點旗子），不用中文字。
      const face = document.createElement("span");
      face.className = i ? "destination" : "origin";
      const glyph = mapIconElement(i ? "flag" : "start", 16);
      glyph.classList.add("endpoint-glyph");
      face.appendChild(glyph);
      const marker = L.marker([p.lat, p.lon], {
        icon: L.divIcon({
          className: "endpoint",
          html: face,
          iconSize: [32, 40],
          iconAnchor: [16, 38],
        }),
        title: i ? `終點：${p.name}` : `起點：${p.name}`,
      }).addTo(ends.current);
      const el = document.createElement("span");
      el.textContent = p.name;
      marker.bindTooltip(el);
    });
    if (route?.requiresEntryConfirmation) {
      [route.coordinates[0], route.coordinates.at(-1)].forEach((p, i) => {
        const face = document.createElement("span");
        face.appendChild(mapIconElement(i ? "flag" : "start", 16));
        L.marker(p, {
          icon: L.divIcon({
            className: "route-entry-marker",
            html: face,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          }),
          title: i ? "路線終點" : "路線起點",
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
