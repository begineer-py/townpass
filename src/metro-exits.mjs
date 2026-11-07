export function metroExitLabel(place) {
  const name = String(place?.name || "").trim();
  if (place?.kind === "station" && /^M[1-8]$/i.test(name)) return name.toUpperCase();
  const explicit = String(place?.exit || "")
    .trim()
    .replace(/^出(?:入)?口\s*/u, "");
  if (explicit) return explicit.slice(0, 4);
  const match =
    name.match(/(?:出入口|出口)[^\dA-Z]*([A-Z]?\d+[A-Z]?)/i) ||
    name.match(/[-－]([A-Z]\d+[A-Z]?)$/i);
  return match?.[1]?.toUpperCase() || "梯";
}

// 本站自帶的出口編號圖示（public/metro-icons/exits，來源與授權見該資料夾 README）。
const EXIT_ICONS = new Set("1 10 11 1A 2 2A 3 3A 4 4A 5 6 7 8 9 M1 M2 M3 M4 M5 M6 M7 M8".split(" "));

export function metroExitIconUrl(place) {
  if (place?.kind && place.kind !== "metro-elevator" && !(place?.kind === "station" && /^M[1-8]$/i.test(String(place.name).trim()))) return "";
  const label = metroExitLabel(place);
  return EXIT_ICONS.has(label) ? `./metro-icons/exits/${label}.svg` : "";
}
