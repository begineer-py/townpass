import { useEffect, useRef } from "react";
import L from "leaflet";
import { category, cleanName } from "./data";
import { BASEMAPS } from "./basemaps.mjs";
import { ROUTE_CONDITIONS, conditionForSegment } from "./route-conditions.mjs";
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
export default function MapView({
  items,
  route,
  constructionConflict,
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
  getBottomInset,
  sheetSnap,
}) {
  const root = useRef(),
    map = useRef(),
    marks = useRef(),
    path = useRef(),
    blocked = useRef(),
    ends = useRef();
  const baseLayers = useRef([]);
  const paddingReader=useRef(getBottomInset);paddingReader.current=getBottomInset;
  const cb = useRef({ onPick, onSelect, onViewport, onGesture, pick });
  cb.current = { onPick, onSelect, onViewport, onGesture, pick };
  useEffect(() => {
    const m = L.map(root.current, {
      zoomControl: false,
      preferCanvas: true,
      minZoom: 11,
      maxZoom: 19,
      zoomAnimation: !matchMedia("(prefers-reduced-motion: reduce)").matches,
    }).setView([25.0478, 121.517], 15);
    map.current = m;
    marks.current = L.layerGroup().addTo(m);
    path.current = L.layerGroup().addTo(m);
    blocked.current = L.layerGroup().addTo(m);
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
    const cell = m.getZoom() < 14 ? 75 : 55,
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
      const marker = L.circleMarker([p.lat, p.lon], {
        radius: count > 1 || colorFriendly ? 12 : 6,
        color: TPColors.white,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.96,
      }).addTo(marks.current);
      const tip = document.createElement("span");
      tip.textContent = cleanName(p.name);
      if (count > 1) {
        const label = document.createElement("span");
        label.textContent = count;
        marker.bindTooltip(label, {
          permanent: true,
          direction: "center",
          className: "cluster-label",
        });
        marker.on("click", () =>
          m.setView([p.lat, p.lon], Math.min(19, m.getZoom() + 2)),
        );
      } else {
        if (colorFriendly) {
          const label = document.createElement('span');
          label.textContent = ({elevator:'梯',toilet:'廁','public-toilet':'廁',rest:'休',water:'水',park:'園',ramp:'坡',station:'站',friendly:'店',parking:'停',bus:'車',health:'醫'})[category(p)] || '點';
          marker.bindTooltip(label, {permanent:true,direction:'center',className:'cluster-label'});
        } else marker.bindTooltip(tip, { direction: "top" });
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
      L.polyline(route.networkCoordinates || route.coordinates, {
        color: TPColors.white,
        weight: 10,
        opacity: 1,
      }).addTo(path.current);
      if(route.tierSegments?.length){
        for(const segment of route.tierSegments){const style=ROUTE_CONDITIONS[conditionForSegment(segment)];const line=L.polyline(segment.coordinates,{color:colorFriendly?TPColors.primary900:style.color,weight:5,dashArray:style.dash,opacity:1}).addTo(path.current);if(segment.sharedRoad===true)line.bindTooltip(`${style.label}；請留意車輛及現場通行狀況`);}
      }else {
        // The online response does not certify width or slope.
        const style=ROUTE_CONDITIONS.unknown;
        L.polyline(route.networkCoordinates||route.coordinates,{color:colorFriendly?TPColors.primary900:style.color,weight:5,dashArray:style.dash,opacity:1}).addTo(path.current);
      }
      for(const approach of route.approaches || []) {const style=ROUTE_CONDITIONS.approach;L.polyline(approach.coordinates,{color:TPColors.white,weight:8,opacity:1}).addTo(path.current);const line=L.polyline(approach.coordinates,{color:colorFriendly?TPColors.primary900:style.color,weight:4,dashArray:style.dash}).addTo(path.current);if(approach.estimated)line.bindTooltip('入口及實際通行狀況未確認，虛線僅為位置估算');}
      const fit=()=>{const height=map.current.getSize().y;map.current.fitBounds(L.latLngBounds(route.coordinates),{animate:false,paddingTopLeft:[24,40],paddingBottomRight:[24,Math.min(height-120,(paddingReader.current?.()||0)+24)]});};
      fit();const timer=setTimeout(fit,350);return ()=>clearTimeout(timer);
    }
  }, [route,sheetSnap,colorFriendly]);
  useEffect(() => {
    if (!blocked.current) return;
    blocked.current.clearLayers();
    const bounds = [];
    for (const work of constructionConflict?.blocked || []) {
      const g = work.geometry;
      if (!g || !Array.isArray(g.coordinates) || !g.coordinates.length) continue;
      const label = document.createElement('span');
      label.textContent = `${work.address || '施工位置'}：${g.type === 'Polygon' ? '施工範圍影響通行' : '施工位置附近可能影響通行，範圍為估計'}`;
      let shape;
      if (g.type === 'Point') shape = L.circle(g.coordinates[0], {radius:10, color:TPColors.red700, fillOpacity:0.2, weight:3});
      else if (g.type === 'LineString') shape = L.polyline(g.coordinates, {color:TPColors.red700, weight:8, dashArray:'5 5'});
      else if (g.type === 'Polygon') shape = L.polygon(g.coordinates, {color:TPColors.red700, fillOpacity:0.2, weight:3});
      if (!shape) continue;
      shape.bindTooltip(label).addTo(blocked.current);
      bounds.push(...g.coordinates);
    }
    if (bounds.length && !route) map.current.fitBounds(L.latLngBounds(bounds), {maxZoom:17, padding:[60,60], animate:false});
  }, [constructionConflict, route]);
  useEffect(() => {
    if (!ends.current) return;
    ends.current.clearLayers();
    if (location) {
      if(Number.isFinite(location.accuracy) && location.accuracy > 0) L.circle([location.lat,location.lon],{radius:location.accuracy,color:TPColors.primary700,weight:1,fillOpacity:0.08,interactive:false}).addTo(ends.current);
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
