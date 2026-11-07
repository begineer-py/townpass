import test from 'node:test';
import assert from 'node:assert/strict';
import {eligibleSharedRoad} from '../src/shared-road-policy.mjs';

test('shared street candidates require all independent checks', () => {
  const way={highway:'living_street',source:'osm-shared-street'};
  const proof={sharedRoad:true,sourceTopologyVerified:true,junctionsVerified:true,roadIntersectionsVerified:true,barriersVerified:true};
  assert.equal(eligibleSharedRoad(way,proof),true);
  for(const k of Object.keys(proof)) assert.equal(eligibleSharedRoad(way,{...proof,[k]:false}),false);
  for(const patch of [{foot:'no'},{access:'private'},{wheelchair:'no'},{bridge:'yes'},{layer:'1'},{highway:'primary'}])
    assert.equal(eligibleSharedRoad({...way,...patch},proof),false);
});
