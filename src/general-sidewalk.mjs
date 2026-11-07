// Count a route segment once, regardless of whether one or both sources record it.
export function generalSidewalkSegment(segment) {
 if (!segment || segment.sharedRoad || segment.crossing) return false;
 if (segment.kind === 'official-line') return true;
 return segment.kind === 'osm' && (segment.explicitSidewalk === true || segment.officialAreaCovered === true);
}
export function generalSidewalkEdge(way, proof) {
 if (!way || way.source === 'osm-shared-street' || proof?.sharedRoad || proof?.connectorVerified || (proof?.crossingCoverage ?? 0) > 0 || way.crossing === true || way.footway === 'crossing') return false;
 return (way.highway === 'footway' && way.footway === 'sidewalk') || (!proof?.gradeSeparatedPedestrian && proof?.coverage >= .9999 && proof?.maxUncoveredMetres <= .05);
}
