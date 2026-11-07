import {sendToTownPass,hasTownPass} from './townpass-bridge.js';
export function mapPickPoint(lat,lon,side,now=Date.now()){
 return {lat,lon,name:'地圖上選的位置',id:`point-${now}`,...(side==='start'?{originKind:'map'}:{})};
}
export function destinationPoint(point){
 if(!point?.originKind)return point;
 const {originKind,...destination}=point;return destination;
}
export function swappedOrigin(point){
 if(/^point-\d+$/.test(String(point?.id||''))&&!point.kind&&!point.sourceId)return {...point,originKind:'map'};
 if(point?.id==='my-location'&&['browser','townpass'].includes(point.locationSource)&&Number.isFinite(point.accuracy)&&point.accuracy>=0&&point.accuracy<=100&&point.needsConfirmation===false)return {...point,originKind:'gps'};
 return point;
}
export function locationError(error){
 if(error?.code===1)return 'LOCATION_DENIED';
 if(error?.code===3)return 'LOCATION_TIMEOUT';
 if(error?.message==='insecure')return 'LOCATION_INSECURE';
 if(error?.message==='unsupported')return 'LOCATION_UNSUPPORTED';
 return 'LOCATION_UNAVAILABLE';
}
function point(coords,source,timestamp=coords?.timestamp){
 const lat=Number(coords?.latitude),lon=Number(coords?.longitude);
 if(coords?.latitude==null||coords?.longitude==null||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw Error('invalid');
 const accuracy=coords.accuracy!=null&&Number.isFinite(Number(coords.accuracy))&&Number(coords.accuracy)>=0?Number(coords.accuracy):null;
 const measuredAt=timestamp!=null&&Number.isFinite(Number(timestamp))?Number(timestamp):null;
 return {lat,lon,name:'我的位置',id:'my-location',originKind:'gps',accuracy,needsConfirmation:accuracy==null||accuracy>100,locationSource:source,timestamp:measuredAt};
}
export async function getLocation(){
 let bridged;try{bridged=await sendToTownPass('location');}catch{}
 if(bridged){try{return point(bridged,'townpass');}catch{}}
 if(!globalThis.navigator?.geolocation)throw Error('unsupported');
 if(globalThis.isSecureContext===false)throw Error('insecure');
 const request=options=>new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(p=>{try{resolve(point(p.coords,'browser',p.timestamp));}catch(e){reject(e);}},reject,options));
 try{const coarse=await request({timeout:10000,maximumAge:60000,enableHighAccuracy:false});if(!coarse.needsConfirmation)return coarse;try{return await request({timeout:20000,maximumAge:0,enableHighAccuracy:true});}catch(error){if(error.code===1)throw error;return coarse;}}
 catch(error){if(error.code===1)throw error;return request({timeout:20000,maximumAge:0,enableHighAccuracy:true});}
}

// A live subscription starts only when requested by the user. Town Pass exposes
// a one-shot location hook, so in that host we poll it rather than assume a
// streaming bridge. Missing source timestamps remain unknown.
export function watchLocation(onPosition,onError){
 let active=true,timer=null,watchId=null;
 const fail=error=>{if(active){active=false;if(watchId!=null)globalThis.navigator?.geolocation?.clearWatch?.(watchId);clearTimeout(timer);onError(error);}};
 if(hasTownPass()){
  const poll=async()=>{try{const p=await getLocation();if(!active)return;onPosition(p);timer=setTimeout(poll,15000);}catch(error){fail(error);}};
  void poll();
 }else if(globalThis.isSecureContext===false)queueMicrotask(()=>fail(Error('insecure')));
 else if(!globalThis.navigator?.geolocation?.watchPosition)queueMicrotask(()=>fail(Error('unsupported')));
 else {
  try {
   watchId=globalThis.navigator.geolocation.watchPosition(
    result=>{if(!active)return;try{onPosition(point(result.coords,'browser',result.timestamp));}catch(error){fail(error);}},
    fail,{timeout:20000,maximumAge:0,enableHighAccuracy:true});
   // Some implementations can report failure synchronously.
   if(!active&&watchId!=null)globalThis.navigator.geolocation.clearWatch?.(watchId);
  } catch(error) { queueMicrotask(()=>fail(error)); }
 }
 return ()=>{active=false;clearTimeout(timer);if(watchId!=null)globalThis.navigator?.geolocation?.clearWatch?.(watchId);};
}
