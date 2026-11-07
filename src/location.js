import {sendToTownPass} from './bridge.js';
export function locationError(error){
 if(error?.code===1)return 'LOCATION_DENIED';
 if(error?.code===3)return 'LOCATION_TIMEOUT';
 if(error?.message==='insecure')return 'LOCATION_INSECURE';
 if(error?.message==='unsupported')return 'LOCATION_UNSUPPORTED';
 return 'LOCATION_UNAVAILABLE';
}
function point(coords,source){
 const lat=Number(coords?.latitude),lon=Number(coords?.longitude);
 if(coords?.latitude==null||coords?.longitude==null||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180)throw Error('invalid');
 const accuracy=coords.accuracy!=null&&Number.isFinite(Number(coords.accuracy))&&Number(coords.accuracy)>=0?Number(coords.accuracy):null;
 return {lat,lon,name:'我的位置',id:'my-location',accuracy,needsConfirmation:accuracy==null||accuracy>100,locationSource:source};
}
export async function getLocation(){
 let bridged;try{bridged=await sendToTownPass('location');}catch{}
 if(bridged){try{return point(bridged,'townpass');}catch{}}
 if(!globalThis.navigator?.geolocation)throw Error('unsupported');
 if(globalThis.isSecureContext===false)throw Error('insecure');
 const request=options=>new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(p=>{try{resolve(point(p.coords,'browser'));}catch(e){reject(e);}},reject,options));
 try{const coarse=await request({timeout:10000,maximumAge:60000,enableHighAccuracy:false});if(!coarse.needsConfirmation)return coarse;try{return await request({timeout:20000,maximumAge:0,enableHighAccuracy:true});}catch(error){if(error.code===1)throw error;return coarse;}}
 catch(error){if(error.code===1)throw error;return request({timeout:20000,maximumAge:0,enableHighAccuracy:true});}
}
