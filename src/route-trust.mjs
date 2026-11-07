import {ROUTING_POLICY} from './routing.mjs';

// A reference line is useful for inspection, but must never become navigation.
export function isVerifiedNavigationRoute(route){
 return !!route && route.kind!=='provisional' && route.navigationAllowed!==false && route.policyVersion===ROUTING_POLICY &&
  ['pedestrian-network-v1','official-polygons-and-crossings-v1'].includes(route.geometryVerification);
}
