import test from 'node:test';import assert from 'node:assert/strict';
import {getLocation,locationError,watchLocation,mapPickPoint,destinationPoint,swappedOrigin} from '../src/location.js';
function environment(t,bridge,get){const old={window:globalThis.window,navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator')};globalThis.window={flutterObject:bridge};Object.defineProperty(globalThis,'navigator',{configurable:true,value:{geolocation:{getCurrentPosition:get}}});t.after(()=>{globalThis.window=old.window;if(old.navigator)Object.defineProperty(globalThis,'navigator',old.navigator);else delete globalThis.navigator;});}
const coords={latitude:25.04,longitude:121.52,accuracy:20};
test('native bridge exception actually falls back to browser geolocation',async t=>{let calls=0;environment(t,{addEventListener(){},removeEventListener(){},postMessage(){throw Error('bridge');}},ok=>{calls++;ok({coords});});const p=await getLocation();assert.equal(calls,1);assert.equal(p.locationSource,'browser');});
test('native onmessage-only bridge works and restores the listener',async t=>{const bridge={postMessage(){this.onmessage({data:JSON.stringify({name:'location',data:coords})});}};environment(t,bridge,()=>{throw Error('unexpected fallback');});const p=await getLocation();assert.equal(p.locationSource,'townpass');assert.equal(bridge.onmessage,undefined);});
test('native ISO timestamp is parsed without inventing a measurement time',async t=>{const stamp='2026-11-08T00:00:00.000Z',bridge={postMessage(){this.onmessage({data:JSON.stringify({name:'location',data:{...coords,timestamp:stamp}})});}};environment(t,bridge,()=>{throw Error('unexpected fallback');});const p=await getLocation();assert.equal(p.timestamp,Date.parse(stamp));assert.ok(Number.isFinite(p.receivedAt));});
test('permission denial is not retried or disguised as timeout',async t=>{let n=0;environment(t,null,(_,fail)=>{n++;fail({code:1});});await assert.rejects(getLocation(),e=>locationError(e)==='LOCATION_DENIED');assert.equal(n,1);});
test('unavailable first source tries high accuracy rather than giving up',async t=>{const flags=[];environment(t,null,(ok,fail,opts)=>{flags.push(opts.enableHighAccuracy);flags.length===1?fail({code:2}):ok({coords});});assert.equal((await getLocation()).lat,25.04);assert.deepEqual(flags,[false,true]);});
test('coarse position is used immediately with its actual accuracy',async t=>{let n=0;environment(t,null,ok=>{n++;ok({coords:{...coords,accuracy:800}});});const p=await getLocation();assert.equal(n,1);assert.equal(p.needsConfirmation,true);assert.equal(p.accuracy,800);assert.equal(p.lat,coords.latitude);assert.equal(p.lon,coords.longitude);});
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
 assert.equal(swappedOrigin({...gps,accuracy:800,needsConfirmation:true}).originKind,'gps');
 assert.equal(swappedOrigin({...gps,accuracy:null,needsConfirmation:true}).originKind,'gps');
 assert.equal(swappedOrigin(end).originKind,'map');
 assert.equal(destinationPoint(start).originKind,'map');
 assert.equal(swappedOrigin({...end,kind:'place',sourceId:'osm'}).originKind,undefined);
});

test('Town Pass polls every 3 seconds after a response and does not overlap or continue after stop',async t=>{
 const bridge={calls:0,postMessage(){this.calls++}};environment(t,bridge,()=>{throw Error('unexpected fallback')});
 const timers=new Map();let id=0;
 t.mock.method(globalThis,'setTimeout',(fn,delay)=>{const key=++id;timers.set(key,{fn,delay});return key;});
 t.mock.method(globalThis,'clearTimeout',key=>timers.delete(key));
 const values=[],stop=watchLocation(p=>values.push(p),()=>assert.fail('unexpected error'));
 assert.equal(bridge.calls,1);assert.equal([...timers.values()].filter(x=>x.delay===3000).length,0);
 bridge.onmessage({data:JSON.stringify({name:'location',data:coords})});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(values.length,1);const timer=[...timers.entries()].find(([,item])=>item.delay===3000);assert.ok(timer);
 timers.delete(timer[0]);timer[1].fn();assert.equal(bridge.calls,2);
 stop();bridge.onmessage({data:JSON.stringify({name:'location',data:coords})});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(values.length,1);assert.equal([...timers.values()].some(x=>x.delay===3000),false);
});
test('stopping from the location callback does not schedule another native poll',async t=>{
 const bridge={postMessage(){}};environment(t,bridge,()=>{throw Error('unexpected fallback')});const delays=[];
 t.mock.method(globalThis,'setTimeout',(fn,delay)=>{delays.push(delay);return delays.length});t.mock.method(globalThis,'clearTimeout',()=>{});
 let stop;stop=watchLocation(()=>stop(),()=>assert.fail('unexpected error'));
 bridge.onmessage({data:JSON.stringify({name:'location',data:coords})});await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(delays,[4000]);
});
