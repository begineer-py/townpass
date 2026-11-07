export function officialGeometryEvidence(graph) {
  const areas=[...graph.officialAreas], crossings=[...graph.officialCrossingAreas];
  const extra=graph.supplementalEvidence;
  if(extra === undefined) return {areas,crossings};
  if(extra?.schemaVersion!==1 || !Array.isArray(extra.features) || !Array.isArray(extra.sources)) throw Error('INVALID_SUPPLEMENTAL_EVIDENCE');
  const sources=new Set(extra.sources.map(s=>s.id));
  for(const f of extra.features){
    if(!sources.has(f.sourceId)||!['sidewalk-range-2026','marked-sidewalk-2026'].includes(f.sourceId) ||
      typeof f.crossing!=='boolean'||f.crossing !== (f.sourceId==='marked-sidewalk-2026')) throw Error('INVALID_SUPPLEMENTAL_SOURCE');
    const g=f.geometry;
    if(g?.type!=='Polygon'||!Array.isArray(g.coordinates)||!g.coordinates.length) throw Error('INVALID_SUPPLEMENTAL_GEOMETRY');
    for(const ring of g.coordinates){
      if(!Array.isArray(ring)||ring.length<4||ring.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||p[0]<121.4||p[0]>121.8||p[1]<24.9||p[1]>25.3) ||
        ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1]) throw Error('INVALID_SUPPLEMENTAL_RING');
    }
    areas.push(g);if(f.crossing)crossings.push(g);
  }
  return {areas,crossings};
}
