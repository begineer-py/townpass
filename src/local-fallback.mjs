import { constructionFresh } from './construction.mjs';

// Local routing still runs its normal entrance, road and construction checks.
export function startLocalFallback(worker, id, startPlace, endPlace, options, construction) {
  if (!worker || !constructionFresh(construction)) return false;
  worker.postMessage({type:'plan-places',id,startPlace,endPlace,options,construction});
  return true;
}
