import {navigationBearing,navigationProgress} from './navigation-progress.mjs';

// A fresh coarse position can center the map, but it is not a reliable fix
// for advancing turns or triggering automatic rerouting.
export function navigationCameraFocus(position,route,previous=0,now=Date.now()){
 if(position?.originKind!=='gps'||!Number.isFinite(position.lat)||!Number.isFinite(position.lon)||position.lat<24.94||position.lat>25.24||position.lon<121.42||position.lon>121.69)return null;
 const timestamp=Number.isFinite(position.timestamp)?position.timestamp:position.receivedAt;
 if(!Number.isFinite(timestamp)||timestamp>now+5000||now-timestamp>30000)return null;
 const progress=navigationProgress(route,position,previous);
 let bearing=progress?.bearing;
 const start=route?.coordinates?.[0];
 if(!Number.isFinite(bearing)&&Array.isArray(start)&&start.length>=2&&start.slice(0,2).every(Number.isFinite)&&Math.hypot((position.lat-start[0])*111195,(position.lon-start[1])*100700)<1){
  bearing=navigationBearing(route.coordinates,0);
 }
 return {lat:position.lat,lon:position.lon,zoom:18,bearing:Number.isFinite(bearing)?bearing:undefined,token:now};
}
