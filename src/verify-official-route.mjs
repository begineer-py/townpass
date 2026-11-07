import { polygonConnectorChecker, roadConnectorChecker } from './geometry.mjs';
import { validateNetwork } from './network-contract.mjs';
import { metres, ROUTING_POLICY } from './routing.mjs';
import { pointError } from './route-request.mjs';
import { officialGeometryEvidence } from './supplemental-evidence.mjs';

export function createOfficialRouteVerifier(graph) {
  validateNetwork(graph);
  const {areas,crossings}=officialGeometryEvidence(graph);
  const covered = polygonConnectorChecker(areas);
  const roadAllowed = roadConnectorChecker(graph.roadGeometries, crossings);
  const crossingCovered = polygonConnectorChecker(crossings);
  const safe = (a,b) => covered(a,b) && roadAllowed(a,b);
  return (route, start, end) => {
    const coords=route?.coordinates;
    if (route?.provider !== 'taipei-official' || pointError(start) || pointError(end) ||
        !Array.isArray(coords) || coords.length<2 || coords.some(p=>pointError(p)))
      return {error:'OFFICIAL_INVALID'};
    // Check every complete segment, including GIS gap bridges; no distance sampling/buffers.
    for(let i=1;i<coords.length;i++) {
      if(!covered(coords[i-1],coords[i])) return {error:'OFFICIAL_PATH_UNVERIFIED',detourCenter:coords[i-1].map((x,k)=>(x+coords[i][k])/2)};
      if(!roadAllowed(coords[i-1],coords[i])) return {error:'OFFICIAL_ROAD_CONFLICT'};
    }
    if(!Array.isArray(route.segmentPaths)||!route.segmentPaths.length) return {error:'OFFICIAL_INVALID'};
    for(const line of route.segmentPaths) {
      if(!Array.isArray(line)||line.length<2||line.some(p=>pointError(p))) return {error:'OFFICIAL_INVALID'};
      for(let i=1;i<line.length;i++) if(!safe(line[i-1],line[i])) return {error:'OFFICIAL_PATH_UNVERIFIED'};
    }
    if (!Array.isArray(route.crossingSegments)) return {error:'OFFICIAL_INVALID'};
    for(const line of route.crossingSegments) {
      if(!Array.isArray(line)||line.length<2||line.some(p=>pointError(p))) return {error:'OFFICIAL_INVALID'};
      for(let i=1;i<line.length;i++) if(!crossingCovered(line[i-1],line[i])) return {error:'OFFICIAL_CROSSING_UNVERIFIED'};
    }
    // Even a zero-length or sub-5m connector must pass both checks. Do not accept remote snapping.
    if(metres(start,coords[0])>5 || metres(end,coords.at(-1))>5 ||
       !safe(start,coords[0]) || !safe(coords.at(-1),end)) return {error:'OFFICIAL_ENTRY_UNVERIFIED'};
    const coordinates=[...coords];
    const same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
    if(!same(start,coords[0])) coordinates.unshift(start);
    if(!same(end,coords.at(-1))) coordinates.push(end);
    return {...route,coordinates,policyVersion:ROUTING_POLICY,requiresEntryConfirmation:false,
      distance:Math.round(route.distance+metres(start,coords[0])+metres(end,coords.at(-1))),
      geometryVerification:'official-polygons-and-crossings-v1',
      // This verifies supplied GIS evidence, not real-time accessibility or lane area coverage.
      roadPct:null};
  };
}
