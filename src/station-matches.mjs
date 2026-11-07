import { normalize } from "./data.js";
import { stationKey } from "./format.mjs";
import { metroStationCodes } from "./metro-station-icons.mjs";

export function matchMetroStations(query, metro, facilities) {
  const q = normalize(query).replace(/站$/, "");
  if (!q) return [];
  const records = metro?.["metro-elevators"] || [];
  const seen = new Set();
  return records
    .filter((record) => {
      const name = normalize(record["車站名稱"]).replace(/站$/, "");
      return name && (name.includes(q) || q.includes(name));
    })
    .filter((record) => {
      const key = stationKey(record["車站名稱"]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const exact = (record) => normalize(record["車站名稱"]).replace(/站$/, "") === q;
      return Number(exact(b)) - Number(exact(a));
    })
    .slice(0, 2)
    .map((record) => {
      const name = record["車站名稱"], key = stationKey(name);
      return {
        record,
        name,
        codes: metroStationCodes(records.filter((r) => stationKey(r["車站名稱"]) === key).map((r) => r["車站編號"])),
        exits: (facilities || []).filter((p) => p.kind === "metro-elevator" && stationKey(p.station) === key),
      };
    });
}
