// Keep the original coordinate tokens so the source geometry is not rounded.
const coordinateToken = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

export function sourceMetadata({expectedSource,sourceSha256,capturedAt,localInput}) {
  return {expectedSource,source:localInput?null:expectedSource,sourceKind:localInput?'local-input':'live-api',sourceVerified:!localInput,sourceSha256,capturedAt:localInput?null:capturedAt};
}

export function parseSidewalkProvenance(payload) {
  if (payload?.code !== '101' || !Array.isArray(payload.data) || payload.data.length > 100000)
    throw Error('INVALID_OFFICIAL_SIDEWALKS');
  const seen = new Set(), parts = [];
  for (const [rowIndex,row] of payload.data.entries()) {
    const id = String(row?.qgs_fid ?? '').trim();
    if (!/^\d+$/.test(id) || seen.has(id)) throw Error(`INVALID_OR_DUPLICATE_ID:${rowIndex}`);
    seen.add(id);
    const wkt = String(row?.STAsText ?? '').trim(), outer = /^MULTILINESTRING\s*\(([\s\S]*)\)$/i.exec(wkt);
    if (!outer || wkt.length > 100000) throw Error(`INVALID_GEOMETRY:${id}`);
    const matches = [...outer[1].matchAll(/\(([^()]*)\)/g)];
    const remainder = outer[1].replace(/\([^()]*\)/g,'').trim();
    if (!matches.length || !/^,\s*(?:,\s*)*$/.test(remainder) && remainder !== '' || (remainder.match(/,/g)||[]).length !== matches.length-1)
      throw Error(`INVALID_GEOMETRY:${id}`);
    for (const [partIndex,match] of matches.entries()) {
      const coordinates = match[1].split(',').map(pair => pair.trim().split(/\s+/));
      if (coordinates.length < 2 || coordinates.some(pair => pair.length !== 2 || pair.some(v=>!coordinateToken.test(v)) ||
        !(Number(pair[0])>100000 && Number(pair[0])<400000 && Number(pair[1])>2600000 && Number(pair[1])<2900000)))
        throw Error(`INVALID_COORDINATES:${id}:${partIndex}`);
      parts.push({sourceId:id,partIndex,coordinates});
    }
  }
  return parts;
}

// Output the existing display schema in the same part order as the sidecar.
export function encodeDisplayLines(parts, project, scale = 1e6) {
  return parts.map(({coordinates}) => {
    const pts=coordinates.map(pair=>{
      const [lon,lat]=project(pair.map(Number));
      if(!Number.isFinite(lat)||!Number.isFinite(lon))throw Error('INVALID_PROJECTION');
      return [Math.round(lat*scale),Math.round(lon*scale)];
    });
    const lats=pts.map(p=>p[0]),lons=pts.map(p=>p[1]);
    return [Math.min(...lats),Math.min(...lons),Math.max(...lats),Math.max(...lons),...pts.flat()];
  });
}
