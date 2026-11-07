import test from 'node:test';
import assert from 'node:assert/strict';
import {isVerifiedNavigationRoute} from '../src/route-trust.mjs';
import {ROUTING_POLICY} from '../src/routing.mjs';

test('only current independently verified routes can be used for navigation',()=>{
 for(const geometryVerification of ['pedestrian-network-v1','official-polygons-and-crossings-v1'])
  assert.equal(isVerifiedNavigationRoute({geometryVerification,policyVersion:ROUTING_POLICY}),true);
 for(const route of [null,{}, {kind:'provisional',navigationAllowed:false},
  {kind:'provisional',geometryVerification:'pedestrian-network-v1',policyVersion:ROUTING_POLICY},
  {navigationAllowed:false,geometryVerification:'pedestrian-network-v1',policyVersion:ROUTING_POLICY},
  {geometryVerification:'pedestrian-network-v1',policyVersion:'old'},
  {geometryVerification:'unverified',policyVersion:ROUTING_POLICY}])assert.equal(isVerifiedNavigationRoute(route),false);
});
