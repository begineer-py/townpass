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
import { ROUTE_CONDITIONS, conditionForSegment } from "./route-conditions.mjs";
import { TPColors } from "./tp-colors.mjs";
import { mapIconElement } from "./map-icons.mjs";
import { NO_WALK_URLS } from "./issue-icons.mjs";
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
// 在 canvas 上畫一張圖（不利通行號誌，高／中／低各一張）：數百個點也不必各建一個 DOM 標記。
// radius 決定重繪範圍，圖以 radius*2 見方畫在點的中心。
const noWalkImages = NO_WALK_URLS.map((src) => Object.assign(new Image(), { src }));
const ImageMark = L.CircleMarker.extend({
  _updatePath() {
    const r = this._renderer,
      img = this.options.image;
    if (!r._drawing || this._empty() || !img?.complete) return;
    const s = this._radius * 2;
    r._ctx.drawImage(img, this._point.x - s / 2, this._point.y - s / 2, s, s);
  },
});
// 標記（圖形＋店名）隨縮放一起變大變小：縮放 18 為原尺寸，最小 0.9 倍免得太難點。
const pinScale = (z) => Math.min(1.15, Math.max(0.9, 1 + (z - 18) * 0.13));
// 縮放越大，設施標記用越小的格子分群。
const markerClusterCell = (z) =>
  z < 14 ? 140 : z < 16 ? 120 : z < 17 ? 100 : z < 18 ? 80 : z < 19 ? 60 : 40;
// Dense issue records are sampled more sparsely at lower zooms to keep the map responsive.
const issueMarkerCell = (z) => z >= 19 ? 38 : z >= 18 ? 46 : z >= 17 ? 54 : 64;
const transitMarkerLimit = (z) => z >= 19 ? 180 : z >= 18 ? 120 : z >= 17 ? 70 : 40;
const otherMarkerLimit = (z) => z >= 19 ? 260 : z >= 18 ? 160 : z >= 17 ? 80 : z >= 16 ? 50 : 30;
// 店家與地標在圖形下方顯示名稱。
const hasLabel = (p) =>
  p.landmark || ["place", "friendly"].includes(category(p));
// 估計名稱寬度（11px 字，中文一字一格，英數約半格），最多約 9 個字寬後截斷。
const labelWidth = (name) =>
  Math.min(
    99,
    [...name].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? 11 : 6.5), 0),
  ) + 4;
function drawOfficialConditions(group,conditions){
  for(const point of conditions?.points||[]){
    if(!Number.isFinite(point.lat)||!Number.isFinite(point.lon))continue;
    const label=document.createElement('span');label.textContent=`${point.label}；與路線的實際關係未確認`;
    L.circleMarker([point.lat,point.lon],{radius:6,color:TPColors.white,weight:2,fillColor:TPColors.orange700,fillOpacity:1}).bindTooltip(label).addTo(group);
  }
}
export default function MapView({
  items,
  route,
  partialRoute,
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
          originKind: "map",
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
      if (m.getZoom() < 16) {
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
      // 不利通行點位跟人行道同一個圖層：放大到 16 以上才畫。
      // 不利通行（淨寬不足）用「禁止行人」號誌，依平臺活動區域分級上色（高紫、中黃、低青綠）；
      // 行穿線未設置路緣斜坡為空心紅圈。號誌比圓點大，彼此太近（同一格）只畫一個：高 > 中 > 低 > 紅圈。
      if (issues && m.getZoom() >= 16) {
        const z = m.getZoom(),
          size = z >= 19 ? 28 : z >= 18 ? 24 : z >= 17 ? 20 : 16,
          cell = issueMarkerCell(z),
          taken = new Set();
        const free = (lat, lon) => {
          const pt = m.latLngToContainerPoint([lat, lon]),
            key = `${Math.floor(pt.x / cell)}:${Math.floor(pt.y / cell)}`;
          if (taken.has(key)) return false;
          taken.add(key);
          return true;
        };
        const visible = visibleSidewalkIssues(issues, m.getBounds()).sort(
          (a, b) => a.kind - b.kind,
        );
        for (const { lat, lon, kind } of visible) {
          if (!free(lat, lon)) continue;
          if (kind === 3)
            L.circleMarker([lat, lon], {
              renderer,
              pane: "official-sidewalks",
              radius: size * 0.32,
              color: TPColors.red600,
              weight: z >= 18 ? 3 : 2.5,
              fillColor: TPColors.white,
              fillOpacity: 1,
              interactive: false,
            }).addTo(drawing);
          else
            new ImageMark([lat, lon], {
              renderer,
              pane: "official-sidewalks",
              radius: size / 2,
              image: noWalkImages[kind],
              interactive: false,
            }).addTo(drawing);
        }
      }
      drawing.getAttribution = () =>
        `無障礙通行線 © <a href="${OFFICIAL_SIDEWALK_SOURCE}" target="_blank" rel="noopener">臺北市政府</a>`;
      drawing.addTo(m);
      onOfficialSidewalkStatus?.("ready");
    };
    let redrawTimer;
    const scheduleDraw = () => {
      clearTimeout(redrawTimer);
      redrawTimer = setTimeout(draw, 120);
    };
    onOfficialSidewalkStatus?.("loading");
    // 不利通行點位載入失敗時，人行道照常顯示。
    loadSidewalkIssues()
      .then((result) => {
        if (!active) return;
        issues = result;
        // 號誌圖還沒解碼完時先略過，載好再重畫一次。
        for (const img of noWalkImages)
          if (!img.complete)
            img.addEventListener("load", () => active && draw(), { once: true });
        draw();
      })
      .catch(() => {});
    loadOfficialSidewalks()
      .then((result) => {
        if (!active) return;
        features = result;
        draw();
        m.on("moveend", scheduleDraw);
      })
      .catch(() => {
        if (active) onOfficialSidewalkStatus?.("error");
      });
    return () => {
      active = false;
      clearTimeout(redrawTimer);
      m.off("moveend", scheduleDraw);
      clear();
      renderer.remove();
    };
  }, [showOfficialSidewalk]);
  useEffect(() => {
    if (!marks.current) return;
    marks.current.clearLayers();
    const m = map.current,
      b = m.getBounds(),
      z = m.getZoom(),
      viewportSize = m.getSize();
    const inView = items.filter((p) => b.contains([p.lat, p.lon]));
    const byDistanceToCenter = (places) => places
      .map((p) => {
        const pos = m.latLngToContainerPoint([p.lat, p.lon]);
        return { p, distance: Math.hypot(pos.x - viewportSize.x / 2, pos.y - viewportSize.y / 2) };
      })
      .sort((a, b) => a.distance - b.distance)
      .map(({ p }) => p);
    const transit = byDistanceToCenter(inView.filter((p) => p.kind === "metro-elevator" || category(p) === "station"));
    const other = byDistanceToCenter(inView.filter((p) => p.kind !== "metro-elevator" && category(p) !== "station"));
    const visible = [...transit.slice(0, transitMarkerLimit(z)), ...other.slice(0, otherMarkerLimit(z))];
    const cell = markerClusterCell(z),
      buckets = new Map();
    for (const p of visible) {
      const pos = m.latLngToContainerPoint([p.lat, p.lon]),
        key =
          p.kind === "metro-elevator"
            ? `metro-exit:${p.id}`
            : p.overview || category(p) === "station"
              ? `landmark:${p.lat.toFixed(5)}:${p.lon.toFixed(5)}`
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
      const keepTransitIcon = p.kind === "metro-elevator" || category(p) === "station";
      if (count > 1 && !keepTransitIcon) {
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
        const exitIcon = metroExitIconUrl(p);
        if (exitIcon || p.kind === "metro-elevator") face.classList.add("metro-exit-face");
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
              exitIcon || p.kind === "metro-elevator"
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
  }, [items, colorFriendly]);
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
    } else if (partialRoute) {
      const bounds=[];
      for(const segment of partialRoute.segments){
        drawOfficialConditions(path.current,segment.officialConditions);
        bounds.push(...segment.coordinates);
        L.polyline(segment.networkCoordinates,{color:TPColors.white,weight:10,opacity:1}).addTo(path.current);
        if(segment.tierSegments.length){
          for(const tier of segment.tierSegments){const style=ROUTE_CONDITIONS[conditionForSegment(tier)];L.polyline(tier.coordinates,{color:colorFriendly?TPColors.primary900:style.color,weight:5,dashArray:style.dash,opacity:1}).addTo(path.current);}
        }else{
          const style=ROUTE_CONDITIONS.unknown;L.polyline(segment.networkCoordinates,{color:colorFriendly?TPColors.primary900:style.color,weight:5,dashArray:style.dash,opacity:1}).addTo(path.current);
        }
        for(const crossing of segment.crossingUncertainties||[]){const coords=crossing.coordinates;if(!Array.isArray(coords)||coords.length<2||!coords.every(p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])))continue;L.polyline(coords,{color:TPColors.primary900,weight:3,dashArray:'2 5',opacity:.9}).bindTooltip('OSM 過街位置，官方資料未完整確認').addTo(path.current);}
        for(const approach of segment.approaches){const style=ROUTE_CONDITIONS.approach;L.polyline(approach.coordinates,{color:TPColors.white,weight:8,opacity:1}).addTo(path.current);const l=L.polyline(approach.coordinates,{color:colorFriendly?TPColors.primary900:style.color,weight:4,dashArray:style.dash}).addTo(path.current);if(approach.estimated)l.bindTooltip('入口銜接為位置估算，實際通行狀況未確認');}
      }
      for(const [side,label] of [['startSide','起點側路段到此'],['endSide','目的地側路段由此開始']]){
        const point=partialRoute.gap[side];if(!point)continue;bounds.push(point);
        L.circleMarker(point,{radius:9,color:TPColors.white,weight:3,fillColor:TPColors.orange700,fillOpacity:1}).bindTooltip(label,{permanent:true,direction:side==='startSide'?'top':'bottom',offset:side==='startSide'?[0,-8]:[0,8]}).addTo(path.current);
      }
      if (bounds.length) {
        map.current.fitBounds(L.latLngBounds(bounds).pad(0.2), { maxZoom: 17 });
      }
    }
  }, [route, partialRoute, colorFriendly]);
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
      map.current.setView([focus.lat, focus.lon], focus.zoom ?? Math.max(17, map.current.getZoom()));
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
