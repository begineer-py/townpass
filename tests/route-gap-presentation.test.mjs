import test from 'node:test';
import assert from 'node:assert/strict';
import {routeGapPresentation} from '../src/route-gap-presentation.mjs';
test('only NO_ROUTE gets two labelled context points, never a line or closure claim',()=>{
 const gap={status:'candidate',startSide:[25,121.5],endSide:[25,121.501],straightMetres:100};
 const result=routeGapPresentation('NO_ROUTE',gap);
 assert.equal(result.status,'candidate');assert.deepEqual(result.startSide,gap.startSide);assert.deepEqual(result.endSide,gap.endSide);
 assert.match(result.message,/不是通行路線/);assert.match(result.message,/不代表現場封閉/);assert.equal(result.coordinates,undefined);
 assert.equal(routeGapPresentation('CONSTRUCTION_BLOCKED',gap),null);assert.equal(routeGapPresentation('NO_CONNECTION',gap),null);
});
test('missing and malformed locations are reported honestly',()=>{
 for(const gap of [null,{status:'unavailable'},{status:'candidate',startSide:[NaN,1],endSide:[25,121.5],straightMetres:3}]){
  const p=routeGapPresentation('NO_ROUTE',gap);assert.equal(p.status,'unavailable');assert.match(p.message,/無法定位/);
 }
});
