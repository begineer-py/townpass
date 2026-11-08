import {sendToTownPass,hasTownPass} from './townpass-bridge.js';
export function mapPickPoint(lat,lon,side,now=Date.now()){
 return {lat,lon,name:'地圖上選的位置',id:`point-${now}`,originKind:'map'};
}
export function destinationPoint(point){
 if(!point?.originKind||(point.originKind==='map'&&/^point-\d+$/.test(String(point.id||''))&&point.kind==null&&point.sourceId==null))return point;
 const {originKind,...destination}=point;return destination;
}
export function swappedOrigin(point){
 if(/^point-\d+$/.test(String(point?.id||''))&&!point.kind&&!point.sourceId)return {...point,originKind:'map'};
 if(point?.id==='my-location'&&['browser','townpass'].includes(point.locationSource)&&(point.accuracy===null||(Number.isFinite(point.accuracy)&&point.accuracy>=0)))return {...point,originKind:'gps'};
 return destinationPoint(point);
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
 const numeric=timestamp!=null?Number(timestamp):NaN,parsed=typeof timestamp==='string'&&!Number.isFinite(numeric)?Date.parse(timestamp):NaN;
 const measuredAt=Number.isFinite(numeric)?numeric:Number.isFinite(parsed)?parsed:null;
 return {lat,lon,name:'我的位置',id:'my-location',originKind:'gps',accuracy,needsConfirmation:accuracy==null||accuracy>100,locationSource:source,timestamp:measuredAt,receivedAt:Date.now()};
}
export async function browserLocation(){
 if(globalThis.isSecureContext===false)throw Error('insecure');
 if(!globalThis.navigator?.geolocation)throw Error('unsupported');
 const request=options=>new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(p=>{try{resolve(point(p.coords,'browser',p.timestamp));}catch(e){reject(e);}},reject,options));
 try{return await request({timeout:10000,maximumAge:60000,enableHighAccuracy:false});}
 catch(error){if(error.code===1)throw error;return request({timeout:20000,maximumAge:0,enableHighAccuracy:true});}
}
export async function townPassLocation(){
 let bridged;try{bridged=await sendToTownPass('location');}catch{return null;}
 if(!bridged)return null;
 try{return point(bridged,'townpass');}catch{return null;}
}
export function devLocation(search=globalThis.location?.search){
 if(!import.meta.env?.DEV||!search)return null;
 const params=new URLSearchParams(search),[lat,lon]=String(params.get('devLocation')||'').split(',').map(Number);
 const rawAccuracy=params.get('devAccuracy'),accuracy=rawAccuracy===null?5:rawAccuracy==='unknown'?null:Number(rawAccuracy);
 return Number.isFinite(lat)&&Number.isFinite(lon)?point({latitude:lat,longitude:lon,accuracy},'browser',Date.now()):null;
}
export async function getLocation(){
 const fake=devLocation();if(fake)return fake;
 const bridged=await townPassLocation();if(bridged)return bridged;
 return browserLocation();
}

// A live subscription starts only when requested by the user. Town Pass exposes
// a one-shot location hook, so in that host we poll it rather than assume a
// streaming bridge. Missing source timestamps remain unknown.
export function watchLocation(onPosition,onError){
 let active=true,timer=null,watchId=null;
 const fail=error=>{if(active){active=false;if(watchId!=null)globalThis.navigator?.geolocation?.clearWatch?.(watchId);clearTimeout(timer);onError(error);}};
 const fake=devLocation();
 if(fake){
  const poll=()=>{if(!active)return;onPosition({...fake,timestamp:Date.now()});if(active)timer=setTimeout(poll,15000);};
  queueMicrotask(poll);
  return ()=>{active=false;clearTimeout(timer);};
 }
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

export function locationErrorText(error){
 if(error?.message==='insecure')return '這個網址不是 HTTPS，瀏覽器不允許定位。請改用 https 網址或在電腦上用 localhost 開啟；也可以搜尋地點，或在地圖上選擇。';
 if(error?.message==='unsupported')return '這個瀏覽器不支援定位。你仍可以搜尋地點，或在地圖上選擇。';
 if(error?.code===1)return '沒有定位權限。請在瀏覽器或手機設定允許這個網站使用位置；也可以搜尋地點，或在地圖上選擇。';
 if(error?.code===2)return '裝置目前取不到位置，請確認已開啟定位服務。你仍可以搜尋地點，或在地圖上選擇。';
 if(error?.code===3)return '定位逾時，請到訊號較好的地方再試一次，或搜尋地點、在地圖上選擇。';
 return '目前無法取得位置。你仍可以搜尋地點，或在地圖上選擇。';
}
