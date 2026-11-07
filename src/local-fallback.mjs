import { constructionFresh } from './construction.mjs';

const fallbackVerificationErrors = new Set([
  'OFFICIAL_PATH_UNVERIFIED', 'OFFICIAL_ROAD_CONFLICT',
  'OFFICIAL_CROSSING_UNVERIFIED', 'OFFICIAL_ENTRY_UNVERIFIED',
  'CONSTRUCTION_BLOCKED',
]);

export function canFallbackAfterVerification(error) {
  return fallbackVerificationErrors.has(error);
}

// Local routing still runs its normal entrance, road and construction checks.
export function startLocalFallback(worker, id, startPlace, endPlace, options, construction) {
  if (!worker || !constructionFresh(construction)) return false;
  worker.postMessage({type:'plan-places',id,startPlace,endPlace,options,construction});
  return true;
}
