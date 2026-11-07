import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet-rotate";
import { category, cleanName, labels } from "./data";
import { BASEMAPS } from "./basemaps.mjs";
import { ROUTE_CONDITIONS, conditionForSegment, fallbackRouteCondition } from "./route-conditions.mjs";
import { TPColors } from "./tp-colors.mjs";
import { focusOffsetForInset, layoutMapMarkers, isMetroStation, metroExitLabelForAccessibility, selectMapMarkers } from "./marker-layout.mjs";
import { useSidewalkLayer } from "./use-sidewalk-layer.js";
import { isNumberedStationExit, metroExitIconUrl, metroExitLabel } from "./metro-exits.mjs";
import { loadSidewalkIssues, visibleSidewalkIssues } from "./official-sidewalks.mjs";
import { NO_WALK_URLS, UNKNOWN_NO_WALK_URL } from "./issue-icons.mjs";
import { groupVisibleIssues, hitIssueGroup, issueGroupLabel } from "./issue-presentation.mjs";
import {routeIssueMarkers} from "./route-issue-markers.mjs";
import {useConstructionLayer} from "./use-construction-layer.js";
import "./route-issue-markers.css";
import { metroStationCodes, metroStationIconUrl } from "./metro-station-icons.mjs";
import { mapIconElement } from "./map-icons.mjs";
import { mapPickPoint } from "./location.js";
import { REFERENCE_STYLES, referenceRouteLines } from "./reference-route-presentation.mjs";
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
const iconKind = (kind) => ({ place: "store", "public-toilet": "toilet" })[kind] || kind;
const isMetroExit = (p) => p.kind === "metro-elevator" || p.kind === "metro-exit" || isNumberedStationExit(p);
const isExitSymbol = (p) => p.kind === "metro-exit" || isNumberedStationExit(p);
const markerKindLabel = (p) => isExitSymbol(p)
  ? metroExitLabelForAccessibility(p)
  : labels[category(p)] || "地點";
const noWalkImages = [...NO_WALK_URLS, UNKNOWN_NO_WALK_URL].map((src) => Object.assign(new Image(), { src }));
const ImageMark = L.CircleMarker.extend({
  _updatePath() {
    const renderer = this._renderer, img = this.options.image;
    if (!renderer._drawing || this._empty() || !img?.complete) return;
    const size = this._radius * 2;
    renderer._ctx.drawImage(img, this._point.x - size / 2, this._point.y - size / 2, size, size);
  },
});
const pinScale = (zoom) => Math.min(1.15, Math.max(0.9, 1 + (zoom - 18) * 0.13));
export default function MapView({
  items,
  recentPlaces = [],
  route,
  onAvoidOfficialCondition,
  avoidingOfficialCondition,
  referenceRoute,
  partialRoute,
  constructionConflict,
  constructionSnapshot,
  onAvoidConstruction,
  avoidingConstruction,
  showConstruction = true,
  onConstructionStatus,
  routeGap,
  nearbyCandidates,
  onNearbySelect,
  start,
  end,
  location,
  focus,
  pick,
  basemap = "street",
  showOfficialSidewalk = true,
  hideMapIcons = false,
  activeFilter = "all",
  colorFriendly = false,
  onBasemapStatus,
  onOfficialSidewalkStatus,
  onPick,
  onSelect,
  onViewport,
  onMapReady,
  onGesture,
  onBearing,
  getBottomInset,
  sheetSnap,
  fitPadding,
}) {
  const root = useRef(),
    map = useRef(),
    marks = useRef(),
    path = useRef(),
    referencePath = useRef(),
    referenceRenderer = useRef(),
    partialPath = useRef(),
    blocked = useRef(),
    routeIssues = useRef(),
    gap = useRef(),
    nearby = useRef(),
    ends = useRef();
  const baseLayers = useRef([]);
  const markerData = useRef({ items, recentPlaces, colorFriendly, hideMapIcons, activeFilter });
  const markerRedraw = useRef();
  markerData.current = { items, recentPlaces, colorFriendly, hideMapIcons, activeFilter };
  const paddingReader=useRef(getBottomInset);paddingReader.current=getBottomInset;
  const fitPaddingReader=useRef(fitPadding);fitPaddingReader.current=fitPadding;
  const routePadding = (height) => fitPaddingReader.current?.() || {paddingTopLeft:[24,40],paddingBottomRight:[24,Math.min(height-120,(paddingReader.current?.()||0)+24)]};
  const cb = useRef({ onPick, onSelect, onViewport, onGesture, onNearbySelect, onBearing, pick, onAvoidOfficialCondition });
  cb.current = { onPick, onSelect, onViewport, onGesture, onNearbySelect, onBearing, pick, onAvoidOfficialCondition };
  useEffect(() => {
    const m = L.map(root.current, {
      zoomControl: false,
      preferCanvas: true,
      minZoom: 11,
      maxZoom: 19,
      zoomAnimation: !matchMedia("(prefers-reduced-motion: reduce)").matches,
      rotate: true, touchRotate: true, shiftKeyRotate: true, rotateControl: false, bearing: 0,
    }).setView([25.0478, 121.517], 15);
    map.current = m;
    if (import.meta.env.DEV) window.__haohaoMap = m;
    m.attributionControl?.setPrefix(false);
    marks.current = L.layerGroup().addTo(m);
    const referencePane=m.getPane('reference-route')||m.createPane('reference-route',m.getPane('rotatePane')||undefined);
    referencePane.style.zIndex='390';referencePane.style.pointerEvents='none';
    referenceRenderer.current=L.canvas({pane:'reference-route',padding:.25});
    referencePath.current=L.layerGroup().addTo(m);
    path.current = L.layerGroup().addTo(m);
    partialPath.current = L.layerGroup().addTo(m);
    blocked.current = L.layerGroup().addTo(m);
    const issuePane=m.getPane('route-issues')||m.createPane('route-issues',m.getPane('rotatePane')||undefined);
    issuePane.style.zIndex='650';
    const issueLinePane=m.getPane('route-issue-line')||m.createPane('route-issue-line',m.getPane('rotatePane')||undefined);
    issueLinePane.style.zIndex='405';
    routeIssues.current=L.layerGroup().addTo(m);
    gap.current = L.layerGroup().addTo(m);
    nearby.current = L.layerGroup().addTo(m);
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
    const scale = (zoom) => root.current?.style.setProperty("--pin-scale", pinScale(zoom).toFixed(3));
    scale(m.getZoom());
    m.on("zoomanim", (event) => scale(event.zoom));
    m.on("zoomend", () => scale(m.getZoom()));
    m.on("rotate", () => cb.current.onBearing?.(m.getBearing()));
    m.on("click", (e) => {
      if (cb.current.pick)
        cb.current.onPick(mapPickPoint(e.latlng.lat,e.latlng.lng,cb.current.pick));
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
      if (map.current === m) map.current = null;
      m.remove();
    };
  }, []);
  useSidewalkLayer(map, location, showOfficialSidewalk, onOfficialSidewalkStatus);
  const constructionPriorityIds=[...(route?.construction?.nearby||[]),...(constructionConflict?.blocked||[]),...(partialRoute?.segments||[]).flatMap(segment=>segment.construction?.nearby||[])].map(work=>work.id).filter(Boolean);
  useConstructionLayer(map,constructionSnapshot,showConstruction,onConstructionStatus,constructionPriorityIds,hideMapIcons,onAvoidConstruction,avoidingConstruction);
  useEffect(() => {
    const m = map.current;
    if (!m || !showOfficialSidewalk || hideMapIcons) return;
    const pane = m.getPane("sidewalk-issues") || m.createPane("sidewalk-issues", m.getPane("rotatePane") || undefined);
    pane.style.zIndex = "351";
    // The issue canvas covers the map. Leave it transparent to pointer events
    // and hit-test only rendered issue symbols at the map container instead.
    pane.style.pointerEvents = "none";
    const renderer = L.canvas({pane: "sidewalk-issues", padding: 0.25});
    const layer = L.layerGroup().addTo(m);
    let active = true, issues, timer, hitGroups = [], hitRadius = 0, hoverFrame = 0;
    const container = m.getContainer(), tooltip = L.tooltip({direction:'top', offset:[0,-10]}), popup = L.popup({offset:[0,-10]});
    const hit = (event) => {
      if (cb.current.pick || event.target.closest?.('.leaflet-control, .leaflet-marker-icon, .leaflet-popup, .leaflet-tooltip')) return null;
      return hitIssueGroup(hitGroups, m.mouseEventToContainerPoint(event), hitRadius);
    };
    const hover = (event) => {
      cancelAnimationFrame(hoverFrame);
      hoverFrame=requestAnimationFrame(() => {
        const group=hit(event);
        if (!group || m.dragging?.moving()) { tooltip.remove(); return; }
        const content=document.createElement('span');content.textContent=issueGroupLabel(group.points);
        tooltip.setLatLng([group.points[0].lat,group.points[0].lon]).setContent(content).addTo(m);
      });
    };
    const click = (event) => {
      const group=hit(event);if(!group)return;
      event.preventDefault();event.stopPropagation();
      const content=document.createElement('span');content.textContent=issueGroupLabel(group.points);
      popup.setLatLng([group.points[0].lat,group.points[0].lon]).setContent(content).openOn(m);
    };
    const leave=()=>tooltip.remove();
    container.addEventListener('mousemove',hover,true);
    container.addEventListener('click',click,true);
    container.addEventListener('mouseleave',leave);
    const draw = () => {
      if (!active) return;
      layer.clearLayers();
      hitGroups = []; tooltip.remove();
      if (!issues || m.getZoom() < 16) return;
      const z = m.getZoom(), size = z >= 19 ? 28 : z >= 18 ? 24 : z >= 17 ? 20 : 16;
      const cell = z >= 19 ? 38 : z >= 18 ? 46 : z >= 17 ? 54 : 64;
      const groups = groupVisibleIssues(visibleSidewalkIssues(issues, m.getBounds()), p => m.latLngToContainerPoint([p.lat,p.lon]), cell);
      hitRadius = Math.max(12, size/2);
      for (const group of groups) {
        const {lat, lon, kind} = group[0], text=issueGroupLabel(group);
        const {x,y}=m.latLngToContainerPoint([lat,lon]);hitGroups.push({x,y,points:group});
        const mark = kind === 3 ? L.circleMarker([lat, lon], {renderer, pane:"sidewalk-issues", radius:size*0.32, color:TPColors.red600, weight:z>=18?3:2.5, fillColor:TPColors.white, fillOpacity:1})
          : new ImageMark([lat, lon], {renderer, pane:"sidewalk-issues", radius:size/2, image:noWalkImages[kind===4?3:kind]});
        mark.addTo(layer);
      }
    };
    const schedule = () => {clearTimeout(timer); timer=setTimeout(draw,120);};
    loadSidewalkIssues().then((data) => {if (!active) return; issues=data; draw();}).catch(() => {});
    for (const img of noWalkImages) if (!img.complete) img.addEventListener("load", draw, {once:true});
    m.on("moveend", schedule);
    return () => {active=false; clearTimeout(timer); cancelAnimationFrame(hoverFrame); container.removeEventListener('mousemove',hover,true);container.removeEventListener('click',click,true);container.removeEventListener('mouseleave',leave);tooltip.remove();popup.remove();m.off("moveend", schedule);layer.remove();renderer.remove();};
  }, [showOfficialSidewalk, hideMapIcons]);
  useEffect(() => {
    if (!map.current) return;
    const m = map.current,
      spec = BASEMAPS[basemap] || BASEMAPS.street;
    for (const layer of baseLayers.current) layer.remove();
    baseLayers.current = [];
    root.current?.removeAttribute("data-tile-error");
    onBasemapStatus?.("loading");
    let active=true;
    const tileStates=[];
    const updateStatus=()=>{
      if(!active)return;
      const zoom=m.getZoom(),visible=tileStates.filter(item=>zoom>=(item.layer.options.minZoom??0)&&zoom<=(item.layer.options.maxZoom??Infinity));
      const failed=visible.some(item=>item.failed);
      if(failed){root.current?.setAttribute("data-tile-error", "true");onBasemapStatus?.("error");}
      else {root.current?.removeAttribute("data-tile-error");onBasemapStatus?.(visible.some(item=>item.loading)?"loading":"ready");}
    };
    const watch = (layer) => {
      const item={layer,loading:true,failed:false};tileStates.push(item);
      layer.on("loading", () => {item.loading=true;item.failed=false;updateStatus();});
      layer.on("tileerror", () => {item.failed=true;updateStatus();});
      layer.on("load", () => {item.loading=false;updateStatus();});
      layer.addTo(m);
      baseLayers.current.push(layer);
    };
    m.on("zoomend",updateStatus);
    // spec.close：放大到 minZoom 以上改用另一組圖磚（例如不印店名的底圖）。
    const close = spec.close && hideMapIcons ? {...spec.close, minZoom: 11} : spec.close;
    if (!close || close.minZoom > 11) watch(
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
          attribution: hideMapIcons ? close.attribution : undefined,
        });
        watch(roads);
      }
    }
    if (spec.overlay) {
      const overlay = L.tileLayer(spec.overlay, {
        maxZoom: 19,
        maxNativeZoom: 19,
        zIndex: 2,
        opacity: 0.85,
      });
      watch(overlay);
    }
    return () => {
      active=false;m.off("zoomend",updateStatus);
      for (const layer of baseLayers.current) {
        // Leaflet's own remove listener unregisters the layer's map events.
        // Clearing listeners first leaves zoom/viewreset callbacks on the map.
        layer.remove();
      }
      baseLayers.current = [];
    };
  }, [basemap, hideMapIcons]);
  useEffect(() => {
    const m = map.current;
    if (!m || !marks.current) return;
    let openPopup = null;
    let redrawPending = false;
    let rotationTimer;
    let redrawTimer;
    const renderMarkers = () => {
      // The popup can pan the map. Keep its source marker until the user
      // chooses or closes it, then draw the new viewport.
      if (openPopup && markerData.current.hideMapIcons) m.closePopup(openPopup);
      if (openPopup) { redrawPending = true; return; }
      marks.current.clearLayers();
      const bounds = m.getBounds();
      const visible = [];
      const visibleRecent = markerData.current.recentPlaces.filter(p=>Number.isFinite(p?.lat)&&Number.isFinite(p?.lon)&&bounds.contains([p.lat,p.lon]));
      for (const p of selectMapMarkers(markerData.current.items, visibleRecent, m.getZoom(), markerData.current.activeFilter)) {
        if (category(p) === "ramp") continue;
        if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon) || !bounds.contains([p.lat, p.lon])) continue;
        const pos = m.latLngToContainerPoint([p.lat, p.lon]);
        visible.push({ p, x: pos.x, y: pos.y });
      }
      // Choose one readable marker per occupied screen area; known duplicates
      // are filtered earlier and exact colocated places remain in a list.
      const size = Math.ceil(32 * pinScale(m.getZoom()));
      const center = m.getSize().divideBy(2);
      const groups = layoutMapMarkers(visible,{size,center,recentPlaces:visibleRecent,activeFilter:markerData.current.activeFilter});
      for (const { points, label: markerText } of groups) {
        const p = points[0].p, kind = category(p), multiple = points.length > 1;
        const name = cleanName(p.name) || labels[kind] || "地點";
        const color = markerData.current.colorFriendly ? TPColors.primary900 : colors[kind] || TPColors.primary700;
        const face = document.createElement("span");
        face.style.setProperty("--pin", color);
        const stationIcon = isMetroStation(p) ? metroStationIconUrl(metroStationCodes(p.name)[0]) : "";
        const exitIcon = isExitSymbol(p) && m.getZoom() >= 16 ? metroExitIconUrl(p) : "";
        if (isExitSymbol(p) && m.getZoom() >= 16) face.classList.add("metro-exit-face");
        if (stationIcon) {
          face.classList.add("metro-station-face");
          const img = document.createElement("img"); img.src = stationIcon; img.alt = ""; face.appendChild(img);
        } else if (exitIcon) {
          face.classList.add("has-exit-icon");
          const img = document.createElement("img"); img.src = exitIcon; img.alt = ""; face.appendChild(img);
        } else if (isExitSymbol(p) && m.getZoom() >= 16 && metroExitLabel(p) !== "梯") {
          face.textContent = metroExitLabel(p);
        } else {
          face.classList.add("has-glyph"); face.appendChild(mapIconElement(m.getZoom() < 16 && isMetroExit(p) ? "place" : p.kind === "metro-exit" ? "entrance" : p.kind === "metro-elevator" ? "elevator" : iconKind(kind), 16));
        }
        const body = document.createElement("div");
        body.className = "pin-body";
        body.appendChild(face);
        if (isExitSymbol(p) && m.getZoom() >= 16) {
          const stationBadge = metroStationIconUrl(p.stationCode);
          if (stationBadge) {
            const img = document.createElement("img");
            img.className = "metro-station-badge"; img.src = stationBadge; img.alt = "";
            body.classList.add("has-station-badge");
            body.appendChild(img);
          }
          if (p.elevator === true) {
            const lift = document.createElement("div");
            lift.className = "metro-lift-badge"; lift.appendChild(mapIconElement("elevator", 11));
            body.appendChild(lift);
          }
        }
        if (markerText) {
          const label = document.createElement("div"); label.className = "pin-label"; label.textContent = markerText; body.appendChild(label);
        }
        const marker = L.marker([p.lat, p.lon], {
          title: multiple ? `${markerKindLabel(p)}：${name}（同位置 ${points.length} 個地點）` : `${markerKindLabel(p)}：${name}`,
          icon: L.divIcon({
            className: isExitSymbol(p) && m.getZoom() >= 16 ? "fac-pin metro-exit-pin" : p.landmark ? "fac-pin landmark" : "fac-pin",
            html: body, iconSize: p.landmark ? [32, 32] : [28, 28], iconAnchor: p.landmark ? [16, 16] : [14, 14],
          }),
        }).addTo(marks.current);
        if (!markerText) {
          const tip = document.createElement("span"); tip.textContent = multiple ? `${name}（同位置 ${points.length} 個地點）` : name;
          marker.bindTooltip(tip, { direction: "top", offset: [0, -14] });
        }
        marker.on("click", (event) => {
          L.DomEvent.stopPropagation(event);
          if (!multiple) {
            if (cb.current.pick) cb.current.onPick(p); else cb.current.onSelect(p);
            return;
          }
          cb.current.onGesture?.();
          const list = document.createElement("div"); list.className = "facility-marker-choices";
          const heading = document.createElement("strong"); heading.textContent = "同位置的地點"; list.append(heading);
          for (const { p: choice } of points) {
            const choiceKind = category(choice), button = document.createElement("button"); button.type = "button";
            const iconUrl = isMetroStation(choice)
              ? metroStationIconUrl(metroStationCodes(choice.name)[0])
              : isExitSymbol(choice) && m.getZoom() >= 16 ? metroExitIconUrl(choice) : "";
            const icon = iconUrl ? document.createElement("img") : mapIconElement(iconKind(choiceKind), 16);
            if (iconUrl) { icon.src = iconUrl; icon.alt = ""; }
            const text = document.createElement("span");
            const stationCode = choice.kind === "metro-exit" ? metroStationIconUrl(choice.stationCode) : "";
            text.textContent = `${markerKindLabel(choice)}：${cleanName(choice.name) || "未命名"}${stationCode ? `（${choice.stationCode}）` : ""}`;
            button.append(icon, text);
            if (stationCode) {
              const station = document.createElement("img"); station.src = stationCode; station.alt = ""; station.className = "metro-choice-station";
              button.append(station);
            }
            button.addEventListener("click", () => {
              m.closePopup(openPopup);
              if (cb.current.pick) cb.current.onPick(choice); else cb.current.onSelect(choice);
            });
            list.append(button);
          }
          L.DomEvent.disableClickPropagation(list);
          L.DomEvent.disableScrollPropagation(list);
          const height = m.getSize().y;
          const bottom = Math.min(Math.max(0, paddingReader.current?.() || 0), Math.max(0, height - 120));
          const popup = L.popup({
            maxHeight: Math.max(70, Math.min(260, height - bottom - 100)),
            autoPanPaddingTopLeft: [16, 16], autoPanPaddingBottomRight: [16, bottom + 16],
          }).setLatLng(marker.getLatLng()).setContent(list);
          openPopup = popup;
          popup.openOn(m);
          requestAnimationFrame(() => list.querySelector("button")?.focus());
        });
      }
    };
    const close = (event) => {
      if (event.popup !== openPopup) return;
      openPopup = null;
      if (redrawPending) { redrawPending = false; redrawTimer = setTimeout(renderMarkers, 0); }
    };
    const rotate = () => { clearTimeout(rotationTimer); rotationTimer = setTimeout(renderMarkers, 120); };
    markerRedraw.current = renderMarkers;
    m.on("moveend", renderMarkers);
    m.on("rotate", rotate);
    m.on("popupclose", close);
    renderMarkers();
    return () => {
      clearTimeout(rotationTimer);
      clearTimeout(redrawTimer);
      markerRedraw.current = undefined;
      m.off("moveend", renderMarkers);
      m.off("rotate", rotate);
      m.off("popupclose", close);
    };
  }, []);
  useEffect(() => { markerRedraw.current?.(); }, [items, recentPlaces, colorFriendly, hideMapIcons, activeFilter]);
  useEffect(() => {
    if(!referencePath.current||!referenceRenderer.current)return;
    referencePath.current.clearLayers();
    const lines=referenceRouteLines(route?.kind==='official-passageway'?route:referenceRoute,{start,end});
    // Draw the whole outline first so adjacent segment outlines cannot cover
    // an already drawn route and create visible gaps at their shared points.
    for(const line of lines){
      L.polyline(line.coordinates,{pane:'reference-route',renderer:referenceRenderer.current,interactive:false,color:TPColors.white,weight:7,opacity:1}).addTo(referencePath.current);
    }
    for(const line of lines){
      const style=REFERENCE_STYLES[line.kind],options={pane:'reference-route',renderer:referenceRenderer.current,interactive:line.approximateCrossing===true};
      const stroke=L.polyline(line.coordinates,{...options,color:style.color,weight:style.weight,dashArray:style.dashArray,opacity:1}).addTo(referencePath.current);
      if(line.approximateCrossing)stroke.bindTooltip('過街邊界未確認');
    }
    if(lines.length&&(!route||route.kind==='official-passageway')&&!partialRoute&&map.current){const points=lines.flatMap(line=>line.coordinates),height=map.current.getSize().y;map.current.fitBounds(L.latLngBounds(points),{animate:false,...routePadding(height)});}
  },[referenceRoute,route,partialRoute,start,end,hideMapIcons]);
  useEffect(() => {
    if (!path.current) return;
    path.current.clearLayers();
    if (route?.coordinates && route.kind!=='official-passageway') {
      L.polyline(route.networkCoordinates || route.coordinates, {
        color: TPColors.white,
        weight: 10,
        opacity: 1,
      }).addTo(path.current);
      if(route.tierSegments?.length){
        for(const segment of route.tierSegments){const style=ROUTE_CONDITIONS[conditionForSegment(segment)];const line=L.polyline(segment.coordinates,{color:colorFriendly?TPColors.primary900:style.color,weight:8,dashArray:style.dash,opacity:1}).addTo(path.current);if(segment.sharedRoad===true)line.bindTooltip(`${style.label}；請留意車輛及現場通行狀況`);}
      }else {
        // The online response does not certify width or slope.
        const style=ROUTE_CONDITIONS[fallbackRouteCondition(route)];
        L.polyline(route.networkCoordinates||route.coordinates,{color:colorFriendly?TPColors.primary900:style.color,weight:8,dashArray:style.dash,opacity:1}).addTo(path.current);
      }
      for (const crossing of route.crossingUncertainties || []) {
        const coords = crossing.coordinates;
        if (!Array.isArray(coords) || coords.length < 2 || !coords.every(p=>Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))) continue;
        L.polyline(coords, {color: TPColors.primary900, weight: 3, dashArray: '2 5', opacity: 0.9})
          .bindTooltip('OSM 過街位置，官方資料未完整確認').addTo(path.current);
      }
      for (const coords of route.crossingSegments || []) {
        if (!Array.isArray(coords) || coords.length < 2 || !coords.every(p=>Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]))) continue;
        L.polyline(coords, {color: TPColors.primary900, weight: 3, dashArray: '2 5', opacity: 0.9}).bindTooltip('過街').addTo(path.current);
      }
      for(const approach of route.approaches || []) {const style=ROUTE_CONDITIONS.approach;L.polyline(approach.coordinates,{color:TPColors.white,weight:6,opacity:1}).addTo(path.current);const line=L.polyline(approach.coordinates,{color:colorFriendly?TPColors.primary900:style.color,weight:4,dashArray:style.dash}).addTo(path.current);if(approach.estimated)line.bindTooltip('入口及實際通行狀況未確認，虛線僅為位置估算');}
      const m=map.current;
      const fit=()=>{if(!m||map.current!==m)return;const height=m.getSize().y;m.fitBounds(L.latLngBounds(route.coordinates),{animate:false,...routePadding(height)});};
      fit();const timer=setTimeout(fit,350);return ()=>clearTimeout(timer);
    }
  }, [route,sheetSnap,colorFriendly,hideMapIcons]);
  useEffect(() => {
    if(!partialPath.current)return;
    partialPath.current.clearLayers();
    if(!partialRoute)return;
    const bounds=[];
    for(const segment of partialRoute.segments){
      bounds.push(...segment.coordinates);
      L.polyline(segment.networkCoordinates,{color:TPColors.white,weight:7,opacity:1}).addTo(partialPath.current);
      if(segment.tierSegments.length){
        for(const tier of segment.tierSegments){const style=ROUTE_CONDITIONS[conditionForSegment(tier)];L.polyline(tier.coordinates,{color:colorFriendly?TPColors.primary900:style.color,weight:5,dashArray:style.dash,opacity:1}).addTo(partialPath.current);}
      }else{
        const style=ROUTE_CONDITIONS[fallbackRouteCondition(segment)];L.polyline(segment.networkCoordinates,{color:colorFriendly?TPColors.primary900:style.color,weight:5,dashArray:style.dash,opacity:1}).addTo(partialPath.current);
      }
      for(const crossing of segment.crossingUncertainties||[]){const coords=crossing.coordinates;if(!Array.isArray(coords)||coords.length<2||!coords.every(p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])))continue;L.polyline(coords,{color:TPColors.primary900,weight:3,dashArray:'2 5',opacity:.9}).bindTooltip('OSM 過街位置，官方資料未完整確認').addTo(partialPath.current);}
      for(const approach of segment.approaches){const style=ROUTE_CONDITIONS.approach;L.polyline(approach.coordinates,{color:TPColors.white,weight:6,opacity:1}).addTo(partialPath.current);const l=L.polyline(approach.coordinates,{color:colorFriendly?TPColors.primary900:style.color,weight:4,dashArray:style.dash}).addTo(partialPath.current);if(approach.estimated)l.bindTooltip('入口銜接為位置估算，實際通行狀況未確認');}
    }
    for(const [side,label] of [['startSide','起點側路段到此'],['endSide','目的地側路段由此開始']]){
      const point=partialRoute.gap[side];if(!point)continue;bounds.push(point);
      L.circleMarker(point,{radius:9,color:TPColors.white,weight:3,fillColor:TPColors.orange700,fillOpacity:1}).bindTooltip(label,{permanent:true,direction:side==='startSide'?'top':'bottom',offset:side==='startSide'?[0,-8]:[0,8]}).addTo(partialPath.current);
    }
    if(bounds.length&&!route){const height=map.current.getSize().y;map.current.fitBounds(L.latLngBounds(bounds),{maxZoom:17,animate:false,...routePadding(height)});}
  },[partialRoute,route,sheetSnap,colorFriendly,hideMapIcons]);
  useEffect(() => {
    if(!routeIssues.current)return;
    routeIssues.current.clearLayers();
    const paths=route?[route]:(partialRoute?.segments||[]),seen=new Set();
    for(const path of paths){
      const {markers,highlights}=routeIssueMarkers(path);
      for(const highlight of highlights){
        const note=document.createElement('span');note.textContent=highlight.label;
        L.polyline(highlight.coordinates,{pane:'route-issue-line',color:'#7036a3',weight:4,dashArray:'3 4',opacity:1}).bindTooltip(note).addTo(routeIssues.current);
      }
      for(const marker of markers){
        const key=`${marker.lat},${marker.lon}`;if(seen.has(key))continue;seen.add(key);
        const icon=document.createElement('span');icon.className='route-issue-pin';icon.textContent='!';
        const label=document.createElement('span');label.textContent=`${marker.title}：${marker.detail}`;
        const detail=document.createElement('div'),heading=document.createElement('strong'),body=document.createElement('p');
        heading.textContent=marker.title;body.textContent=marker.detail;detail.append(heading,body);
        if(route && path===route && onAvoidOfficialCondition){
          for(const record of marker.records){
            const button=document.createElement('button');
            button.type='button';button.className='route-issue-avoid';button.disabled=avoidingOfficialCondition;
            button.textContent=marker.records.length>1?`嘗試繞過${record.type==='missing_noCurbSlope'?'淨寬不足':'缺少路緣斜坡'}`:'嘗試繞過';
            button.addEventListener('click',()=>{button.disabled=true;cb.current.onAvoidOfficialCondition?.({...record,lat:marker.lat,lon:marker.lon});});
            detail.append(button);
          }
        }
        const pin=L.marker([marker.lat,marker.lon],{pane:'route-issues',icon:L.divIcon({className:'route-issue-shell',html:icon,iconSize:[30,30],iconAnchor:[15,15]}),title:marker.title,alt:marker.title,keyboard:true}).bindTooltip(label,{direction:'top',offset:[0,-12]}).bindPopup(detail).addTo(routeIssues.current);
        pin.getElement()?.setAttribute('aria-label',`${marker.title}，${marker.detail}`);
      }
    }
  },[route,partialRoute,hideMapIcons,avoidingOfficialCondition]);
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
    if (bounds.length && !route) map.current.fitBounds(L.latLngBounds(bounds), {maxZoom:17, ...routePadding(map.current.getSize().y), animate:false});
  }, [constructionConflict, route]);
  useEffect(() => {
    if(!gap.current)return;
    gap.current.clearLayers();
    if(routeGap?.status!=='candidate')return;
    const points=[[routeGap.startSide,'起點側路網'],[routeGap.endSide,'目的地側路網']];
    for(const [point,label] of points){
      const marker=L.circleMarker(point,{radius:9,color:TPColors.white,weight:3,fillColor:TPColors.orange700,fillOpacity:1}).addTo(gap.current);
      marker.bindTooltip(label,{permanent:true,direction:'top'});
    }
    if(!route&&!constructionConflict?.blocked?.length&&!nearbyCandidates?.length){
      const height=map.current.getSize().y;
      map.current.fitBounds(L.latLngBounds(points.map(([point])=>point)),{maxZoom:17,animate:false,...routePadding(height)});
    }
  },[routeGap,route,constructionConflict,nearbyCandidates]);
  useEffect(() => {
    if(!nearby.current)return;
    nearby.current.clearLayers();
    const bounds=[];
    for(const [index,candidate] of (nearbyCandidates||[]).entries()){
      const point=[candidate.point.lat,candidate.point.lon];bounds.push(point);
      const marker=L.circleMarker(point,{radius:9,color:TPColors.white,weight:3,fillColor:TPColors.primary700,fillOpacity:1}).addTo(nearby.current);
      marker.bindTooltip(`${candidate.side==='start'?'起點':'目的地'}附近位置 ${index+1}：距原點約 ${candidate.straightMetres} 公尺${candidate.point.nearbyNetwork==='shared'?'；人車共行':''}；尚未確認連通`);
      marker.on('click',event=>{L.DomEvent.stopPropagation(event);cb.current.onNearbySelect?.(candidate);});
    }
    if(bounds.length&&!route){const height=map.current.getSize().y;map.current.fitBounds(L.latLngBounds(bounds),{maxZoom:17,animate:false,...routePadding(height)});}
  },[nearbyCandidates,route]);
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
        title: `${i ? "終點" : "起點"}：${p.name}`,
      }).addTo(ends.current);
      const el = document.createElement("span");
      el.textContent = p.name;
      marker.bindTooltip(el);
    });
    if (route?.requiresEntryConfirmation) {
      [route.coordinates[0], route.coordinates.at(-1)].forEach((p, i) => {
        const text = i ? "路線終點" : "路線起點";
        const face = document.createElement("span");
        face.appendChild(mapIconElement(i ? "flag" : "start", 16));
        L.marker(p, {
          icon: L.divIcon({
            className: "route-entry-marker",
            html: face,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          }),
          title: text,
        }).addTo(ends.current);
      });
    }
  }, [start, end, route, location]);
  useEffect(() => {
    if (focus?.lat && map.current) {
      const m = map.current;
      m.setView([focus.lat, focus.lon], focus.zoom || 17, { animate: false });
      const offset = focusOffsetForInset(m.getSize().y, paddingReader.current?.());
      if (offset) m.panBy([0, offset], { animate: false });
    }
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
