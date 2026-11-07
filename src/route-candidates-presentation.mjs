export function presentRouteCandidates(value, policyVersion, sourceUpdatedAt) {
  const items = Array.isArray(value) ? value : value?.candidates;
  if (!Array.isArray(items) || typeof sourceUpdatedAt !== 'string' || !sourceUpdatedAt) return [];
  return items.filter(c => c && c.route && c.route.policyVersion === policyVersion &&
    ((c.route.geometryVerification === 'pedestrian-network-v1' && c.route.provider !== 'taipei-official') ||
     (c.route.geometryVerification === 'official-polygons-and-crossings-v1' && c.route.provider === 'taipei-official')) &&
    c.route.construction?.sourceUpdatedAt === sourceUpdatedAt &&
    Number.isFinite(c.score) && Number.isFinite(c.metrics?.distanceMetres))
    .slice().sort((a,b) => b.score-a.score || a.metrics.distanceMetres-b.metrics.distanceMetres);
}

export function sortRouteCandidates(candidates, order = 'score') {
  return candidates.slice().sort((a, b) => {
    const score = b.score - a.score;
    const distance = a.metrics.distanceMetres - b.metrics.distanceMetres;
    return (order === 'distance' ? distance || score : score || distance) || String(a.id).localeCompare(String(b.id));
  });
}
