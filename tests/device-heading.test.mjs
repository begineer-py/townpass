import test from 'node:test';
import assert from 'node:assert/strict';
import {compassHeading,markerHeading,requestHeadingPermission,watchDeviceHeading} from '../src/device-heading.mjs';

test('accepts calibrated iOS compass and absolute Android orientation, not relative rotation',()=>{
 assert.equal(compassHeading({webkitCompassHeading:90,webkitCompassAccuracy:10}),90);
 assert.equal(compassHeading({webkitCompassHeading:90,webkitCompassAccuracy:-1}),null);
 assert.equal(compassHeading({webkitCompassHeading:90,webkitCompassAccuracy:60}),null);
 assert.equal(compassHeading({absolute:true,alpha:90,beta:0}),270);
 assert.equal(compassHeading({type:'deviceorientationabsolute',alpha:90},90),0);
 assert.equal(compassHeading({absolute:false,alpha:90}),null);
 assert.equal(compassHeading({absolute:true,alpha:90,beta:90}),null);
 assert.equal(compassHeading({absolute:true,alpha:null}),null);
});
test('permission is requested immediately and denied or rejected gracefully',async()=>{
 let called=false,arg;const win={DeviceOrientationEvent:{requestPermission(value){called=true;arg=value;return Promise.resolve('granted')}}};
 const promise=requestHeadingPermission(win);assert.equal(called,true);assert.equal(arg,true);assert.equal(await promise,true);
 assert.equal(await requestHeadingPermission({DeviceOrientationEvent:{requestPermission:()=>Promise.reject(Error('denied'))}}),false);
 assert.equal(await requestHeadingPermission({}),true);
});
test('tracks shortest rotation through north and removes listeners on cleanup',()=>{
 const handlers=new Map(),docHandlers=new Map(),values=[];
 const win={screen:{orientation:{angle:0}},addEventListener:(n,f)=>handlers.set(n,f),removeEventListener:n=>handlers.delete(n),document:{hidden:false,addEventListener:(n,f)=>docHandlers.set(n,f),removeEventListener:n=>docHandlers.delete(n)}};
 const stop=watchDeviceHeading(win,h=>values.push(h));
 handlers.get('deviceorientation')({webkitCompassHeading:350,webkitCompassAccuracy:5});
 handlers.get('deviceorientation')({webkitCompassHeading:10,webkitCompassAccuracy:5});
 assert.equal(values[0],350);assert.equal(values[1],356);
 win.document.hidden=true;docHandlers.get('visibilitychange')();assert.equal(values.at(-1),null);
 stop();assert.equal(handlers.size,0);assert.equal(docHandlers.size,0);
});
test('stale sensor reading is cleared',async()=>{
 const handlers=new Map(),values=[];const win={addEventListener:(n,f)=>handlers.set(n,f),removeEventListener:n=>handlers.delete(n)};
 const stop=watchDeviceHeading(win,h=>values.push(h),{staleMs:5});handlers.get('deviceorientation')({absolute:true,alpha:0});
 await new Promise(resolve=>setTimeout(resolve,20));assert.deepEqual(values,[0,null]);stop();
});

test('marker remains aligned with compass on a rotated map',()=>{
 assert.equal(markerHeading(90,0),90);assert.equal(markerHeading(90,270),0);assert.equal(markerHeading(350,20),10);assert.equal(markerHeading(null,0),null);
});

test('small sensor jitter does not repeatedly update the marker',()=>{
 const handlers=new Map(),values=[];const win={addEventListener:(n,f)=>handlers.set(n,f),removeEventListener:n=>handlers.delete(n)};
 const stop=watchDeviceHeading(win,h=>values.push(h));const on=handlers.get('deviceorientation');
 on({webkitCompassHeading:100});for(let i=0;i<100;i++)on({webkitCompassHeading:100.2});assert.deepEqual(values,[100]);
 on({webkitCompassHeading:110});assert.ok(values.at(-1)>101);stop();
});
