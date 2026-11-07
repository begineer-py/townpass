// OSM also categorizes some numbered entrances as stations.
export function isNumberedStationExit(place) {
  return place?.kind === "station" &&
    /^(?:[A-Z]\d+[A-Z]?|\d+號(?:出入口|出口)|(?:出入口|出口)\s*[A-Z]?\d+[A-Z]?)$/i.test(String(place.name).split(/[（(]/, 1)[0].trim());
}

export function metroExitLabel(place) {
  const name = String(place?.name || "").trim();
  if (isNumberedStationExit(place)) {
    return name.split(/[（(]/, 1)[0].trim()
      .replace(/^(?:出入口|出口)\s*|號(?:出入口|出口)$/g, "").toUpperCase();
  }
  const explicit = String(place?.exit || "")
    .trim()
    .replace(/^出(?:入)?口\s*/u, "");
  if (explicit) return explicit.slice(0, 4);
  const suffix =
    name.match(/[-－]\s*(?:出入口|出口)\s*([A-Z]?\d+[A-Z]?)$/i) ||
    name.match(/[-－]\s*([A-Z]\d+[A-Z]?)$/i);
  // In「出口電梯2」the number identifies the lift, not necessarily an exit.
  const match = suffix || (!/出口電梯/.test(name) && name.match(/(?:出入口|出口)[^\dA-Z]*([A-Z]?\d+[A-Z]?)/i));
  return match?.[1]?.toUpperCase() || "梯";
}

// The official wheel-3 dataset also contains explicitly named metro lifts.
export function isMetroElevatorEntrance(place) {
  return place?.kind === 'metro-elevator' || (String(place?.kind) === '3' && place?.sourceId === 'wheel-3' && /站出口電梯/.test(String(place?.name || '')));
}

// Numbered elevator records are also entrances; unknown numbers remain lifts.
export function isMetroExitSymbol(place) {
  return place?.kind === 'metro-exit' || isNumberedStationExit(place) ||
    (isMetroElevatorEntrance(place) && metroExitLabel(place) !== '梯');
}

// 本站自帶的出口編號圖示（public/metro-icons/exits，來源與授權見該資料夾 README）。
const EXIT_ICONS = new Set("1 10 11 1A 2 2A 3 3A 4 4A 5 6 7 8 9 M1 M2 M3 M4 M5 M6 M7 M8".split(" "));

export function metroExitIconUrl(place) {
  if (place?.kind && place.kind !== "metro-exit" && !isMetroElevatorEntrance(place) && !isNumberedStationExit(place)) return "";
  const label = metroExitLabel(place);
  return EXIT_ICONS.has(label) ? `./metro-icons/exits/${label}.svg` : "";
}
