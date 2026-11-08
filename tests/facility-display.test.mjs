import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSavedFacility} from '../src/facility-display.mjs';
import {addRecentPlace} from '../src/recent-places.mjs';
import {selectMapMarkers} from '../src/marker-layout.mjs';
test('old saved parking name keeps the venue as title and moves district and capacity to details',()=>{
 const p={id:'w16-1469',kind:'16',name:'TPE0400-士林區-新光三越百貨股份有限公司台北天母分公司二館停車場(大型車:0格，小型車:131格(含身心障礙停車位3格)，機車:0格)',lat:25.1172269,lon:121.5341105};
 const result=normalizeSavedFacility(p);
 assert.equal(result.name,'新光三越百貨股份有限公司台北天母分公司二館停車場');assert.equal(result.district,'士林區');
 assert.equal(result.parkingDetails,'大型車:0格，小型車:131格(含身心障礙停車位3格)，機車:0格');assert.equal(result.sourceName,p.name);assert.equal(result.id,p.id);assert.equal(result.lat,p.lat);
 assert.deepEqual(normalizeSavedFacility(result),result);
 assert.equal(normalizeSavedFacility({kind:'16',name:result.name,sourceName:p.name,parkingDetails:result.parkingDetails}).district,'士林區');
 const [recent]=addRecentPlace([],result);assert.equal(recent.parkingDetails,result.parkingDetails);assert.equal(recent.district,'士林區');assert.equal(recent.sourceName,p.name);
});
test('other facilities and already cleaned names remain unchanged',()=>{
 const a={kind:'16',name:'停車場',parkingDetails:'小型車:3格'},b={kind:'friendly',name:'TPE0400-士林區-店名'};
 assert.equal(normalizeSavedFacility(a),a);assert.equal(normalizeSavedFacility(b),b);
});
test('recent map pin can recover parking details from the same current record',()=>{
 const old={id:'w16-1',kind:'16',sourceId:'wheel-16',name:'停車場',lat:25,lon:121.5};
 const fresh={...old,parkingDetails:'小型車:42格'};
 assert.equal(selectMapMarkers([fresh],[old],17)[0].parkingDetails,'小型車:42格');
 assert.equal(selectMapMarkers([{...fresh,sourceId:'other'}],[old],17)[0].parkingDetails,undefined);
});
