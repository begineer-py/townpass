import {planPlaces} from './local-route-verifier.mjs';
import {improvePedestrianRoute} from './pedestrian-improvement.mjs';
import {createRouter} from './routing.mjs';

export function createVerifiedRouter(graph,verifyLocal){
 const base=createRouter(graph);
 const router=(a,b,options={})=>base(a,b,{...options,approachAllowed:(p,n,side)=>verifyLocal.approachAllowed(p,n,side==='start'?options.startPlace:options.endPlace,options,side)});
 router.resetProjectionsIfNeeded=base.resetProjectionsIfNeeded;
 return router;
}

// Shared product/benchmark entry point: resolve station exits and verify the
// base first, then optimise using those exact resolved endpoint identities.
export function planImprovedPlaces(startPlace,endPlace,options,snapshot,deps,config){
 const base=planPlaces(startPlace,endPlace,options,snapshot,deps);
 if(base.error)return base;
 return improvePlannedRoute(base,startPlace,endPlace,options,snapshot,deps,config);
}
export function improvePlannedRoute(base,startPlace,endPlace,options,snapshot,deps,config){
 if(base.error)return base;
 const start=base.resolvedStart||startPlace,end=base.resolvedEnd||endPlace;
 if(!Number.isFinite(start?.lat)||!Number.isFinite(start?.lon)||!Number.isFinite(end?.lat)||!Number.isFinite(end?.lon))return {...base,pedestrianImprovement:{status:'missing-endpoints',iterations:[]}};
 const result=improvePedestrianRoute(base,[start.lat,start.lon],[end.lat,end.lon],{...options,startPlace:start,endPlace:end},snapshot,deps,config);
 return result.error||!base.conditionDetourLimit?result:{...result,conditionDetourLimit:base.conditionDetourLimit};
}
