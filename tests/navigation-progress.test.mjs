import test from 'node:test';
import assert from 'node:assert/strict';
import {navigationProgress,estimatedWalkingMinutes} from '../src/navigation-progress.mjs';
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
});
