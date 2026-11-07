export function maintenanceText(row) {
  const raw = String(row["民國年月日"] || "");
  const date = /^\d{7}$/.test(raw)
    ? `${Number(raw.slice(0, 3)) + 1911} 年 ${Number(raw.slice(3, 5))} 月 ${Number(raw.slice(5, 7))} 日`
    : raw;
  const where = String(row["電梯位置"] || "")
    .replace(/^P\(月台\)$/, "月台電梯")
    .replace(/^EX\d+\((.+)\)$/, "$1 電梯")
    .replace(/^C\((.+)\)$/, "$1");
  const period = String(row["保養時段"] || "")
    .replace("D(日保)", "日間保養")
    .replace("N(夜保)", "夜間保養");
  return `${date} · ${where} · ${period}`;
}
export function sourceCountLabel(source) {
  if (source?.status !== "ok") return "目前未取得資料";
  if (!Number.isFinite(source.count)) return "筆數未提供";
  return `${source.count.toLocaleString()} 筆來源紀錄`;
}
export const stationKey = (s) =>
  String(s || "")
    .replace(/臺/g, "台")
    .replace(/[（(].*$/, "")
    .replace(/站$/, "");
export const addressNorm = (s) =>
  String(s ?? "")
    .replace(/臺/g, "台")
    .replace(/\s/g, "")
    .replace(
      /[一二三四五六七八九十]段/g,
      (v) => `${"一二三四五六七八九十".indexOf(v[0]) + 1}段`,
    )
    .replace(/號$/, "");
export const stepText = (s) =>
  s.crossing
    ? "經行穿線通過路口"
    : `${s.turn && s.turn !== "直行" ? s.turn + "，" : ""}沿${s.name}前行`;
export const stepConditions = s => [s.sharedRoad && '人車共道，留意車輛', s.roughSurface && '路面可能較顛簸', s.unknown && '寬度或坡度未知'].filter(Boolean).join('，');
