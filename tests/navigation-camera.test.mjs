import test from 'node:test';
import assert from 'node:assert/strict';
import {navigationCameraFocus} from '../src/navigation-camera.mjs';
import {navigationProgress} from '../src/navigation-progress.mjs';
const now=100000,a=[25,121.5],b=[25.001,121.5],route={coordinates:[a,b],distance:111,steps:[]};
test('fresh coarse or missing-timestamp fixes center the map without fabricating navigation progress',()=>{
 const p={originKind:'gps',lat:a[0],lon:a[1],accuracy:80,timestamp:null,receivedAt:now};
 const focus=navigationCameraFocus(p,route,0,now);assert.equal(focus.zoom,18);assert.equal(focus.bearing,0);assert.equal(navigationProgress(route,p),null);
 const other={...p,lon:121.501};assert.equal(navigationCameraFocus(other,route,0,now).bearing,undefined);
});
test('rejects stale, future and invalid fixes instead of moving to a wrong location',()=>{
 const p={originKind:'gps',lat:a[0],lon:a[1],accuracy:5,timestamp:now,receivedAt:now};
 assert.equal(navigationCameraFocus({...p,timestamp:now-31000},route,0,now),null);
 assert.equal(navigationCameraFocus({...p,timestamp:now+6000},route,0,now),null);
 assert.equal(navigationCameraFocus({...p,timestamp:null,receivedAt:undefined},route,0,now),null);
 assert.equal(navigationCameraFocus({...p,lat:0},route,0,now),null);
});
