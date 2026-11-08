import test from 'node:test';
import assert from 'node:assert/strict';
import {navigationProgress,estimatedWalkingMinutes,createNavigationSpeedEstimator} from '../src/navigation-progress.mjs';
const A=[25,121.5],B=[25.001,121.5],C=[25.001,121.501];
const route={coordinates:[A,B,C],distance:212,steps:[{lat:A[0],lon:A[1],turn:'直行',name:'步道'},{lat:B[0],lon:B[1],turn:'右轉',name:'另一條路'}]};
test('progress follows the verified route and shows the upcoming turn',()=>{
 const first=navigationProgress(route,{lat:25.0005,lon:121.5,accuracy:5});
 assert.ok(first);assert.equal(first.next.step.turn,'右轉');assert.ok(first.next.distanceMetres>45&&first.next.distanceMetres<65);
 const atTurn=navigationProgress(route,{lat:B[0],lon:B[1],accuracy:5},first.along);assert.equal(atTurn.next.step.turn,'右轉');assert.ok(atTurn.next.distanceMetres<1);
 const later=navigationProgress(route,{lat:C[0],lon:121.5005,accuracy:5},atTurn.along);assert.equal(later.next,null);assert.ok(later.remainingMetres<60);
 const arrived=navigationProgress(route,{lat:C[0],lon:C[1],accuracy:5},later.along);assert.equal(arrived.arrived,true);
});
test('poor or off-route positions never create a turn or advance the route',()=>{
 assert.equal(navigationProgress(route,{lat:25.0005,lon:121.5,accuracy:50}),null);
 assert.equal(navigationProgress(route,{lat:25.01,lon:121.51,accuracy:5}),null);
 assert.equal(navigationProgress(route,{lat:25,lon:121.5,accuracy:null}),null);
 const nearEnd=navigationProgress(route,{lat:C[0]+20/111195,lon:C[1],accuracy:5});assert.ok(nearEnd);assert.equal(nearEnd.arrived,false);
});
test('time is an explicitly estimated walking time',()=>{
 assert.equal(estimatedWalkingMinutes(480),10);assert.equal(estimatedWalkingMinutes(null),null);assert.equal(estimatedWalkingMinutes(-1),null);
 assert.equal(estimatedWalkingMinutes(480,1),8);assert.equal(estimatedWalkingMinutes(480,.2),40);assert.equal(estimatedWalkingMinutes(480,20),10);
});
test('measures steady route progress only after two reliable intervals',()=>{
 const e=createNavigationSpeedEstimator();
 assert.equal(e.sample({along:0,timestamp:1000,accuracy:4}),null);
 assert.equal(e.sample({along:15,timestamp:21000,accuracy:4}),null);
 const speed=e.sample({along:30,timestamp:41000,accuracy:4});assert.equal(speed,.75);
 assert.equal(estimatedWalkingMinutes(450,speed),10);
});
test('jitter, inaccurate fixes, long gaps and implausible speeds do not produce an estimate',()=>{
 const e=createNavigationSpeedEstimator();e.sample({along:0,timestamp:1000,accuracy:5});
 assert.equal(e.sample({along:4,timestamp:21000,accuracy:5}),null);
 assert.equal(e.sample({along:100,timestamp:22000,accuracy:5}),null);
 assert.equal(e.sample({along:110,timestamp:42000,accuracy:25}),null);
 assert.equal(e.sample({along:120,timestamp:200000,accuracy:5}),null);
 assert.equal(e.sample({along:125,timestamp:221000,accuracy:5}),null);
});
