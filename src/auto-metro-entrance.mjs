import {isNumberedStationExit} from './metro-exits.mjs';
import {stationKey} from './format.mjs';

// Explicit exits and unrelated train stations must not be reinterpreted.
export function autoMetroEntrance(place, facilities=[]) {
 if (String(place?.kind)==='20') return true;
 if (place?.kind!=='station' || isNumberedStationExit(place)) return false;
 const key=stationKey(place.name);
 if(!key||!Number.isFinite(place.lat)||!Number.isFinite(place.lon))return false;
 return facilities.some(p=>{
  if(!Number.isFinite(p.lat)||!Number.isFinite(p.lon))return false;
  const name=p.kind==='metro-elevator'?p.station:String(p.kind)==='20'?p.name:null;
  return name&&stationKey(name)===key&&Math.hypot((p.lat-place.lat)*111195,(p.lon-place.lon)*100700)<=300;
 });
}
