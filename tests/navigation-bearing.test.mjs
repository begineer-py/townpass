import test from 'node:test';
import assert from 'node:assert/strict';
import {navigationBearing,navigationProgress} from '../src/navigation-progress.mjs';
test('route heading follows the direction of travel through a turn',()=>{
 const a=[25,121.5],b=[25.001,121.5],c=[25.001,121.501],line=[a,b,c];
 assert.ok(Math.abs(navigationBearing(line,20))<.01);
 assert.ok(Math.abs(navigationBearing(line,150)-90)<.01);
 assert.equal(navigationBearing(line,1000),null);
 const route={coordinates:line,distance:212,steps:[]};
 const p=navigationProgress(route,{lat:25.001,lon:121.5005,accuracy:5});assert.ok(Math.abs(p.bearing-90)<.01);
 assert.equal(navigationProgress(route,{lat:25.01,lon:121.51,accuracy:5}),null);
});
