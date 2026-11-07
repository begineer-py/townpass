import test from 'node:test';import assert from 'node:assert/strict';
import {getLocation,locationError,watchLocation,mapPickPoint,destinationPoint,swappedOrigin} from '../src/location.js';
function environment(t,bridge,get){const old={window:globalThis.window,navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator')};globalThis.window={flutterObject:bridge};Object.defineProperty(globalThis,'navigator',{configurable:true,value:{geolocation:{getCurrentPosition:get}}});t.after(()=>{globalThis.window=old.window;if(old.navigator)Object.defineProperty(globalThis,'navigator',old.navigator);else delete globalThis.navigator;});}
const coords={latitude:25.04,longitude:121.52,accuracy:20};
test('native bridge exception actually falls back to browser geolocation',async t=>{let calls=0;environment(t,{addEventListener(){},removeEventListener(){},postMessage(){throw Error('bridge');}},ok=>{calls++;ok({coords});});const p=await getLocation();assert.equal(calls,1);assert.equal(p.locationSource,'browser');});
test('native onmessage-only bridge works and restores the listener',async t=>{const bridge={postMessage(){this.onmessage({data:JSON.stringify({name:'location',data:coords})});}};environment(t,bridge,()=>{throw Error('unexpected fallback');});const p=await getLocation();assert.equal(p.locationSource,'townpass');assert.equal(bridge.onmessage,undefined);});
test('permission denial is not retried or disguised as timeout',async t=>{let n=0;environment(t,null,(_,fail)=>{n++;fail({code:1});});await assert.rejects(getLocation(),e=>locationError(e)==='LOCATION_DENIED');assert.equal(n,1);});
test('unavailable first source tries high accuracy rather than giving up',async t=>{const flags=[];environment(t,null,(ok,fail,opts)=>{flags.push(opts.enableHighAccuracy);flags.length===1?fail({code:2}):ok({coords});});assert.equal((await getLocation()).lat,25.04);assert.deepEqual(flags,[false,true]);});
test('coarse position is explicitly approximate if refinement times out',async t=>{let n=0;environment(t,null,(ok,fail)=>{++n===1?ok({coords:{...coords,accuracy:800}}):fail({code:3});});const p=await getLocation();assert.equal(p.needsConfirmation,true);assert.equal(p.accuracy,800);});
test('missing accuracy is never reported as zero-metre precision',async t=>{environment(t,null,ok=>ok({coords:{latitude:25.04,longitude:121.52}}));const p=await getLocation();assert.equal(p.accuracy,null);assert.equal(p.needsConfirmation,true);});
test('user-started location watch forwards source timestamp and cleans up',t=>{
 const old={window:globalThis.window,navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator')};let success,cleared;
 globalThis.window={};Object.defineProperty(globalThis,'navigator',{configurable:true,value:{geolocation:{watchPosition(ok,_fail,options){success=ok;assert.equal(options.maximumAge,0);return 42;},clearWatch(id){cleared=id;}}}});
 t.after(()=>{globalThis.window=old.window;if(old.navigator)Object.defineProperty(globalThis,'navigator',old.navigator);else delete globalThis.navigator;});
 const received=[];const stop=watchLocation(p=>received.push(p),()=>assert.fail('unexpected error'));
 success({coords,timestamp:123456});assert.equal(received[0].timestamp,123456);assert.equal(received[0].originKind,'gps');assert.equal(received[0].locationSource,'browser');
 stop();assert.equal(cleared,42);success({coords,timestamp:123457});assert.equal(received.length,1);
});
test('watch permission denial stops tracking',t=>{
 const old={window:globalThis.window,navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator')};let fail,clear;
 globalThis.window={};Object.defineProperty(globalThis,'navigator',{configurable:true,value:{geolocation:{watchPosition(_ok,no){fail=no;return 7;},clearWatch(id){clear=id;}}}});
 t.after(()=>{globalThis.window=old.window;if(old.navigator)Object.defineProperty(globalThis,'navigator',old.navigator);else delete globalThis.navigator;});
 let error;watchLocation(()=>assert.fail('unexpected location'),e=>{error=locationError(e)});fail({code:1});assert.equal(error,'LOCATION_DENIED');assert.equal(clear,7);
});
test('map and GPS origin exception never leak to destination',()=>{
 const start=mapPickPoint(25,121.5,'start',123),end=mapPickPoint(25,121.5,'end',124);
 assert.equal(start.originKind,'map');assert.equal(start.id,'point-123');assert.equal(end.originKind,'map');
 const gps={id:'my-location',lat:25,lon:121.5,originKind:'gps',locationSource:'browser'};
 assert.equal(destinationPoint(gps).originKind,undefined);assert.equal(gps.originKind,'gps');
 assert.equal(swappedOrigin(end).originKind,'map');
 assert.equal(destinationPoint(start).originKind,'map');
 assert.equal(swappedOrigin({...end,kind:'place',sourceId:'osm'}).originKind,undefined);
});
