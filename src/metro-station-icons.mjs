const STATION_CODE = /(?:BL|BR|R|G|O|Y)\d{2}A?/gi;

export function metroStationCodes(...values) {
  const codes = values
    .flat(Infinity)
    .flatMap((value) => String(value || "").match(STATION_CODE) || [])
    .map((code) => code.toUpperCase());
  return [...new Set(codes)];
}

export function metroStationIconUrl(code) {
  const [safe] = metroStationCodes(code);
  return safe
    ? `https://commons.wikimedia.org/wiki/Special:Redirect/file/Taipei_Metro_station_${safe}.svg`
    : "";
}
