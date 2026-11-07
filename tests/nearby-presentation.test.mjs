import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedNearbyChoice,nearbyWarnings,preservesGpsOrigin} from '../src/nearby-presentation.mjs';
import {ROUTING_POLICY} from '../src/routing.mjs';

test('verified alternative keeps both original gaps explicit and rejects stale or mismatched results',()=>{
 const stamp=new Date().toISOString(),snapshot={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]};
 const start={id:'a',name:'地圖選點',lat:25,lon:121.5},end={id:'b',name:'地圖選點',lat:25.001,lon:121.501};
 const a={id:'aa',lat:25.0001,lon:121.5},b={id:'bb',lat:25.0011,lon:121.501,nearbyNetwork:'shared'};
 const route={policyVersion:ROUTING_POLICY,geometryVerification:'pedestrian-network-v1',construction:{sourceUpdatedAt:stamp,blocked:[]},resolvedStart:a,resolvedEnd:b};
 const choice={start:{side:'start',point:a},end:{side:'end',point:b},route};
 const result=verifiedNearbyChoice(choice,start,end,snapshot);
 assert.ok(result);assert.deepEqual(result.start.nearbyOriginal.coordinates,[start.lat,start.lon]);assert.deepEqual(result.end.nearbyOriginal.coordinates,[end.lat,end.lon]);
 assert.match(nearbyWarnings(result.start,result.end)[1],/人車共行.*路線尚未抵達原地點.*銜接與樓層未確認/);
 assert.equal(verifiedNearbyChoice({...choice,route:{...route,policyVersion:'old'}},start,end,snapshot),null);
 assert.equal(verifiedNearbyChoice({...choice,route:{...route,construction:{sourceUpdatedAt:'old'}}},start,end,snapshot),null);
 assert.equal(verifiedNearbyChoice({...choice,start:{point:{...a,lat:26}}},start,end,snapshot),null);
 assert.equal(verifiedNearbyChoice({...choice,route:{...route,construction:{sourceUpdatedAt:stamp,blocked:[{}]}}},start,end,snapshot),null);
});

test('automatic alternatives retain a GPS centre, but can still adjust the destination',()=>{
 const gps={originKind:'gps',lat:25,lon:121.5},end={lat:25.01,lon:121.51};
 assert.equal(preservesGpsOrigin({start:{lat:25,lon:121.5},end},gps),true);
 assert.equal(preservesGpsOrigin({start:{lat:25.0001,lon:121.5},end},gps),false);
 assert.equal(preservesGpsOrigin({start:{lat:25.0001,lon:121.5},end},{...gps,originKind:'map'}),true);
 assert.equal(preservesGpsOrigin(null,gps),false);
});
