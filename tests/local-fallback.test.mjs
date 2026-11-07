import test from 'node:test';
import assert from 'node:assert/strict';
import {startLocalFallback} from '../src/local-fallback.mjs';

test('official failure can start a local route with the original points and current construction data', () => {
  const now=new Date().toISOString();
  const snapshot={schemaVersion:1,fetchedAt:now,sourceUpdatedAt:now,works:[]};
  const start={id:'start',lat:25,lon:121.5},end={id:'end',lat:25.01,lon:121.51},options={avoidSteps:true};
  let message;
  assert.equal(startLocalFallback({postMessage:m=>{message=m;}},42,start,end,options,snapshot),true);
  assert.deepEqual(message,{type:'plan-places',id:42,startPlace:start,endPlace:end,options,construction:snapshot});
});
test('local fallback never bypasses missing or stale construction data', () => {
  const worker={postMessage(){throw Error('must not route');}};
  assert.equal(startLocalFallback(worker,1,{}, {}, {}, null),false);
  assert.equal(startLocalFallback(worker,1,{}, {}, {}, {schemaVersion:1,fetchedAt:'2020-01-01',sourceUpdatedAt:'2020-01-01',works:[]}),false);
  assert.equal(startLocalFallback(null,1,{}, {}, {}, null),false);
});
