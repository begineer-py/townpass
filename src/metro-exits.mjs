export function metroExitLabel(place) {
  const explicit = String(place?.exit || "")
    .trim()
    .replace(/^出(?:入)?口\s*/u, "");
  if (explicit) return explicit.slice(0, 4);
  const name = String(place?.name || "");
  const match =
    name.match(/(?:出入口|出口)[^\dA-Z]*([A-Z]?\d+[A-Z]?)/i) ||
    name.match(/[-－]([A-Z]\d+[A-Z]?)$/i);
  return match?.[1]?.toUpperCase() || "梯";
}
