// Explicit shared-street eligibility. This does not by itself add graph edges.
// A road designation is not a certificate of physical accessibility.
export function eligibleSharedRoad(way, evidence) {
  if (!way || way.highway !== 'living_street' || way.source !== 'osm-shared-street') return false;
  if (['no', 'private'].includes(way.access) || ['no', 'private'].includes(way.foot) || way.wheelchair === 'no') return false;
  if ((way.bridge && way.bridge !== 'no') || (way.tunnel && way.tunnel !== 'no')) return false;
  if (way.layer != null && String(way.layer) !== '0') return false;
  if (way.level != null && String(way.level) !== '0') return false;
  return evidence?.sourceTopologyVerified === true && evidence?.junctionsVerified === true &&
    evidence?.roadIntersectionsVerified === true && evidence?.barriersVerified === true;
}
