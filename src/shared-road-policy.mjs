// Explicit shared-street eligibility. This does not by itself add graph edges.
// A road designation is not a certificate of physical accessibility.
export function eligibleSharedRoad(way, evidence) {
  if (!way || !['living_street','residential','unclassified','service'].includes(way.highway) || way.source !== 'osm-shared-street') return false;
  if ([way.access,way.foot].some(value => value != null && !['yes','permissive','designated'].includes(value)) || way.wheelchair === 'no') return false;
  if ((way.barrier != null && !['no','kerb'].includes(way.barrier)) || way.kerb === 'raised' || (way.kerbHeight != null && (!Number.isFinite(way.kerbHeight) || way.kerbHeight > .03))) return false;
  if (['access:conditional','foot:conditional','wheelchair:conditional','oneway:foot','foot:forward','foot:backward','foot:forward:conditional','foot:backward:conditional'].some(key => way[key] != null)) return false;
  if ((way.bridge && way.bridge !== 'no') || (way.tunnel && way.tunnel !== 'no')) return false;
  if (way.layer != null && String(way.layer) !== '0') return false;
  if (way.level != null && String(way.level) !== '0') return false;
  return evidence?.sharedRoad === true && evidence?.sourceTopologyVerified === true && evidence?.junctionsVerified === true &&
    evidence?.roadIntersectionsVerified === true && evidence?.barriersVerified === true;
}
