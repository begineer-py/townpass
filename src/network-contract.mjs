export function validateNetwork(graph) {
  if (graph?.officialPathEvidence?.schemaVersion !== 2)
    throw Error("UNVERIFIED_NETWORK");
  if (!Array.isArray(graph.officialAreas) || graph.officialAreas.length === 0)
    throw Error("MISSING_OFFICIAL_AREAS");
  if (
    !Array.isArray(graph.officialCrossingAreas) ||
    !Array.isArray(graph.roadGeometries) ||
    !graph.roadGeometries.length
  )
    throw Error("MISSING_CROSSING_MASK");
  if (
    !Array.isArray(graph.nodes) ||
    !Array.isArray(graph.ways) ||
    !Array.isArray(graph.edges)
  )
    throw Error("INVALID_NETWORK");
  for (const e of graph.edges) {
    const v = e[5];
    if(v?.sharedRoad === true && (graph.nodeIdentity !== 'OSM node ID; coincident coordinates do not create connectivity' || !Number.isSafeInteger(graph.nodes[e[0]]?.[3]) || !Number.isSafeInteger(graph.nodes[e[1]]?.[3])))
      throw Error('MISSING_SHARED_NODE_IDENTITY');
    if(v?.gradeSeparatedPedestrian === true && (graph.nodeIdentity !== 'OSM node ID; coincident coordinates do not create connectivity' || !Number.isSafeInteger(graph.nodes[e[0]]?.[3]) || !Number.isSafeInteger(graph.nodes[e[1]]?.[3])))
      throw Error('MISSING_GRADE_NODE_IDENTITY');
    if (
      !v ||
      v.schemaVersion !== 2 ||
      !Number.isFinite(v.coverage) ||
      v.coverage < 0 ||
      v.coverage > 1 ||
      !Number.isFinite(v.maxUncoveredMetres) ||
      v.maxUncoveredMetres < 0 ||
      !Number.isFinite(v.crossingCoverage) ||
      v.crossingCoverage < 0 ||
      v.crossingCoverage > 1 ||
      typeof v.roadCrossingVerified !== "boolean" ||
      typeof v.crossingVerified !== "boolean"
    )
      throw Error("INVALID_EDGE_EVIDENCE");
    if (
      !graph.nodes[e[0]] ||
      !graph.nodes[e[1]] ||
      !graph.ways[e[3]] ||
      !Number.isFinite(e[2]) ||
      e[2] <= 0
    )
      throw Error("INVALID_EDGE");
  }
  return true;
}
