import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveFollow,distanceToRoute,displayedRouteCoordinates} from '../src/live-follow.mjs';

const line=[[25,121.5],[25,121.501]];
const fix=(north,ms,accuracy=5)=>({lat:25+north/111195,lon:121.5005,accuracy,timestamp:ms,id:'my-location',originKind:'gps',locationSource:'browser',needsConfirmation:false});
test('route distance uses segment projection, not only vertices',()=>{
 assert.ok(distanceToRoute([25.00009,121.5005],line)>9);
 assert.ok(distanceToRoute([25.00009,121.5005],line)<11);
 assert.equal(distanceToRoute([25,121.5],[]),Infinity);
});
test('two distinct fresh accurate off-route fixes trigger one replan',()=>{
 let clock=100000,replans=[],statuses=[];const c=createLiveFollow({coordinates:line,now:()=>clock,onReplan:p=>replans.push(p),onStatus:s=>statuses.push(s)});
 c.sample(fix(50,clock));c.sample(fix(50,clock));assert.equal(replans.length,0);
 clock+=1000;c.sample(fix(50,clock));assert.equal(replans.length,1);assert.equal(statuses.at(-1),'replanning');
 clock+=1000;c.sample(fix(60,clock));clock+=1000;c.sample(fix(60,clock));assert.equal(replans.length,1);
 c.complete(line);clock+=1000;c.sample(fix(60,clock));clock+=1000;c.sample(fix(60,clock));assert.equal(replans.length,1);
 clock+=15000;c.sample(fix(60,clock));assert.equal(replans.length,2);
});
test('stale, missing, inaccurate and future fixes cannot trigger replanning',()=>{
 const clock=100000,replans=[];const c=createLiveFollow({coordinates:line,now:()=>clock,onReplan:p=>replans.push(p)});
 for(const p of [fix(80,clock-31000),fix(80,clock+6000),fix(80,clock,31),{...fix(80,clock),timestamp:null},{...fix(80,clock),accuracy:null}]){c.sample(p);c.sample(p)}
 assert.equal(replans.length,0);
});
test('returning to route resets consecutive evidence and stop discards later fixes',()=>{
 let clock=100000,replans=0,positions=0;const c=createLiveFollow({coordinates:line,now:()=>clock,onPosition:()=>positions++,onReplan:()=>replans++});
 c.sample(fix(50,clock));clock+=1000;c.sample(fix(0,clock));clock+=1000;c.sample(fix(50,clock));assert.equal(replans,0);
 c.stop();clock+=1000;c.sample(fix(50,clock));assert.equal(replans,0);assert.equal(positions,3);
});
test('small deviation needs good precision; low-precision drift does not trigger',()=>{
 for(const [distance,accuracy,expected] of [[5,3,1],[10,5,1],[10,20,0]]){
  let now=100000,count=0;const c=createLiveFollow({coordinates:line,now:()=>now,onReplan:()=>count++});
  c.sample(fix(distance,now,accuracy));now+=1000;c.sample(fix(distance,now,accuracy));assert.equal(count,expected,`${distance}m offset, ${accuracy}m accuracy`);
 }
});
test('moving along an unconfirmed displayed approach does not trigger deviation',()=>{
 const start=[25+40/111195,121.5],join=[25,121.5],end=[25,121.501];
 const approach={estimated:true,unconfirmed:true,entryStatus:'unconfirmed',coordinates:[start,join]};
 const route={coordinates:[start,join,end],networkCoordinates:[join,end],approaches:[approach]};
 let now=100000,replans=0;const engine=createLiveFollow({coordinates:displayedRouteCoordinates(route),now:()=>now,onReplan:()=>replans++});
 engine.sample({lat:25+20/111195,lon:121.5,accuracy:3,timestamp:now});
 now+=1000;engine.sample({lat:25+20/111195,lon:121.5,accuracy:3,timestamp:now});
 assert.equal(replans,0);
 assert.equal(approach.estimated,true);assert.equal(approach.unconfirmed,true);assert.equal(approach.entryStatus,'unconfirmed');
 assert.equal(distanceToRoute([25+20/111195,121.5],route.networkCoordinates)>19,true);
});
