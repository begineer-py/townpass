import { useEffect, useRef } from "react";
import L from "leaflet";
import { sidewalkManifest, sidewalkTile, tilesForBounds } from "./sidewalk-tiles.mjs";
import { TPColors } from "./tp-colors.mjs";

// Display-only official passageways. Routing uses its own verified network.
export function useSidewalkLayer(map, location, enabled = true, onStatus) {
  const locationRef = useRef(location);
  const updateRef = useRef();
  const statusRef = useRef(onStatus);
  locationRef.current = location;
  statusRef.current = onStatus;
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!enabled) { statusRef.current?.("idle"); return; }
    const pane = m.getPane("sidewalks") || m.createPane("sidewalks", m.getPane("rotatePane") || undefined);
    pane.style.zIndex = "350";
    pane.style.pointerEvents = "none";
    const renderer = L.canvas({ pane: "sidewalks", padding: 0.25 });
    let generation = 0;
    let drawing;
    const clear = () => { drawing?.remove(); drawing = null; };
    const update = async () => {
      const current = ++generation;
      clear();
      if (m.getZoom() < 16) { statusRef.current?.("zoom"); return; }
      statusRef.current?.("loading");
      try {
        const manifest = await sidewalkManifest();
        if (current !== generation) return;
        const b = m.getBounds();
        const location = locationRef.current;
        const center = location && b.contains([location.lat, location.lon])
          ? {lat: location.lat, lng: location.lon} : m.getCenter();
        const keys = tilesForBounds([b.getSouth(), b.getWest(), b.getNorth(), b.getEast()], center, new Set(manifest.tiles));
        const lines = new Map();
        for (const key of keys) {
          // Sequential requests make the closest tile visible first and stop
          // requesting old-view tiles as soon as the user moves the map.
          const tile = await sidewalkTile(key);
          if (current !== generation) return;
          for (const line of tile) lines.set(line.id, line.points);
          clear();
          const coordinates = [...lines.values()];
          drawing = L.layerGroup([
            L.polyline(coordinates, {renderer, pane: "sidewalks", color: TPColors.white, weight: 4, opacity: .7, interactive: false}),
            L.polyline(coordinates, {renderer, pane: "sidewalks", color: TPColors.orange700, weight: 2, opacity: .7, interactive: false}),
          ]);
          drawing.getAttribution = () => '無障礙通行線 © <a href="https://tppano.gov.taipei/tp_roadsidewalkplatform_public/" target="_blank" rel="noopener">臺北市政府</a>';
          drawing.addTo(m);
        }
        if (current === generation) statusRef.current?.("ready");
      } catch (error) {
        if (current === generation) { console.error("Sidewalk tiles", error); statusRef.current?.("error"); }
      }
    };
    updateRef.current = update;
    m.on("moveend", update);
    update();
    return () => {
      generation++;
      updateRef.current = undefined;
      m.off("moveend", update);
      clear();
      renderer.remove();
    };
  }, [map, enabled]);
  useEffect(() => {
    updateRef.current?.();
  }, [location?.lat, location?.lon]);
}
