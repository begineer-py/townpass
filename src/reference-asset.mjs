// Reference data stays separate from the verified OSM graph.
export function makeReferenceAsset(source){
 if(source?.schemaVersion!==1||source.crs!=='EPSG:3826'||source.sourceKind!=='live-api'||source.sourceVerified!==true||!/^[a-f0-9]{64}$/i.test(source.sourceSha256||'')||!Array.isArray(source.parts))throw Error('INVALID_REFERENCE_SOURCE');
 const parts=source.parts.map(part=>{
  const coordinates=part.coordinates.map(pair=>pair.map(Number));
  if(!/^\d+$/.test(part.sourceId)||!Number.isSafeInteger(part.partIndex)||coordinates.length<2||coordinates.some(p=>p.length!==2||!p.every(Number.isFinite)))throw Error('INVALID_REFERENCE_PART');
  const xs=coordinates.map(p=>p[0]),ys=coordinates.map(p=>p[1]);
  return {qgsFid:part.sourceId,partIndex:part.partIndex,bounds:[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)],coordinates};
 });
 return {schemaVersion:1,source:'official-passageway',sourceHash:source.sourceSha256,sourceCapturedAt:source.capturedAt,crs:'EPSG:3826',parts};
}
