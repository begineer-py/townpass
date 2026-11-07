import {category} from './data.js';
import {isNumberedStationExit} from './metro-exits.mjs';

export const isMetroStation = place => String(place?.kind)==='20';
export function metroExitLabelForAccessibility(place) {
  return `捷運出入口${place?.elevator === true ? '（有電梯）' : ''}`;
}
export function focusOffsetForInset(height, bottomInset) {
  const inset=Math.min(Math.max(0,Number(bottomInset)||0),Math.max(0,height-120));
  return Math.round(inset/2);
}
const keyOf=p=>p?.id!=null?`id:${p.id}`:`location:${p?.lat}:${p?.lon}:${p?.name||''}`;
const allowedCoordinate=p=>Number.isFinite(p?.lat)&&Number.isFinite(p?.lon);
const accessibleParking=p=>{
  if(String(p?.kind)==='16'||p?.sourceId==='wheel-16')return true;
  const explicit=p?.accessibleParkingCount??p?.disabledParkingCount??p?.['capacity:disabled'];
  return Number.isFinite(Number(explicit))&&Number(explicit)>0;
};
function zoomVisible(place,zoom,activeFilter){
 const k=category(place);
 if(k==='ramp')return false;
 if(activeFilter&&activeFilter!=='all'&&k===activeFilter)return true;
 if(isMetroStation(place)||(place.landmark&&place.kind!=='metro-elevator'))return true;
 if(zoom<16)return false;
 if(place.kind==='metro-exit')return place.officialAccessible===true||place.elevator===true||zoom>=18;
 if(isNumberedStationExit(place))return zoom>=18;
 if(k==='elevator'||k==='toilet')return true;
 if(zoom<17)return false;
 if(k==='public-toilet'||k==='park'||k==='health'||(k==='parking'&&accessibleParking(place)))return true;
 return zoom>=18;
}

// Non-representative duplicate records remain available to search and routing;
// the map chooses an in-viewport representative without deleting any data.
export function selectMapMarkers(items,recentPlaces,zoom,activeFilter='all'){
 const seen=new Set(),recentIds=new Set((recentPlaces||[]).filter(allowedCoordinate).map(keyOf)),selected=[],groups=new Set();
 const add=place=>{if(!allowedCoordinate(place))return;const key=keyOf(place);if(seen.has(key))return;seen.add(key);selected.push(place);};
 for(const p of recentPlaces||[]){add(p);if(p?.mapGroupId!=null)groups.add(String(p.mapGroupId));}
 const candidates=(items||[]).filter(p=>zoomVisible(p,zoom,activeFilter)).slice().sort((a,b)=>Number(b?.mapGroupRepresentative===true)-Number(a?.mapGroupRepresentative===true));
 for(const p of candidates){
  if(!allowedCoordinate(p))continue;
  const group=p.mapGroupId!=null?String(p.mapGroupId):null;
  if(group&&groups.has(group)&&!recentIds.has(keyOf(p)))continue;
  add(p);if(group)groups.add(group);
 }
 return selected;
}
const GENERIC=new Set(['飲水處','飲水台','飲水機','座椅','椅子','長椅','休息座椅','休息處','廁所','一般公廁','無障礙廁所','停車場','公園','公車站','電梯','設施']);
export function markerLabel(place){
 const name=String(place?.name||'').replace(/\s+/g,' ').trim();if(!name)return null;
 let label=name;
 if(GENERIC.has(name)){
  const location=String(place.locationName||'').replace(/\s+/g,' ').trim();
  if(!location||GENERIC.has(location))return null;
  label=`${name}・${location}`;
 }
 const chars=[...label];return chars.length>8?`${chars.slice(0,8).join('')}…`:label;
}
function boxesFor(point,size,label){
 const h=size/2,icon={x0:point.x-h,x1:point.x+h,y0:point.y-h,y1:point.y+h};
 if(!label)return [icon];
 const width=Math.min(96,[...label].reduce((n,c)=>n+(c.charCodeAt(0)>0x2e80?11:6.5),0)+4);
 return [icon,{x0:point.x-width/2,x1:point.x+width/2,y0:point.y+h+1,y1:point.y+h+17}];
}
const intersects=(a,b)=>a.x0<b.x1&&a.x1>b.x0&&a.y0<b.y1&&a.y1>b.y0;
// Keep an actual representative per screen cell. If distinct venues have the
// exact same coordinates, their identities remain in a tap-to-choose list.
// Labels take priority over extra markers, except user-selected history.
export function layoutMapMarkers(points,{size=32,center={x:0,y:0},recentPlaces=[],activeFilter='all'}={}){
 if(!Number.isFinite(size)||size<=0)return [];
 const recent=new Set((recentPlaces||[]).map(keyOf)),valid=(points||[]).filter(x=>x?.p&&Number.isFinite(x.x)&&Number.isFinite(x.y));
 const rank=p=>recent.has(keyOf(p))?0:(activeFilter!=='all'&&category(p)===activeFilter)?1:(isMetroStation(p)||p.landmark)?2:markerLabel(p)?3:4;
 const sorted=valid.slice().sort((a,b)=>rank(a.p)-rank(b.p)||Math.hypot(a.x-center.x,a.y-center.y)-Math.hypot(b.x-center.x,b.y-center.y));
 const groups=[],cells=new Map(),occupied=new Map(),gridSize=64;
 const keys=box=>{const result=[];for(let x=Math.floor(box.x0/gridSize);x<=Math.floor(box.x1/gridSize);x++)for(let y=Math.floor(box.y0/gridSize);y<=Math.floor(box.y1/gridSize);y++)result.push(`${x}:${y}`);return result;};
 const anyOverlap=boxes=>boxes.some(box=>keys(box).some(key=>(occupied.get(key)||[]).some(other=>intersects(box,other))));
 const record=boxes=>{for(const box of boxes)for(const key of keys(box)){if(!occupied.has(key))occupied.set(key,[]);occupied.get(key).push(box);}};
 const exact=new Map();
 for(const point of sorted){
  const location=`${point.p.lat}:${point.p.lon}`,existing=exact.get(location);
  if(existing){existing.points.push(point);continue;}
  const cell=`${Math.floor(point.x/size)}:${Math.floor(point.y/size)}`,label=markerLabel(point.p),boxes=boxesFor(point,size,label),isRecent=recent.has(keyOf(point.p));
  if(!isRecent&&(cells.has(cell)||anyOverlap(boxes)))continue;
  const group={x:point.x,y:point.y,points:[point],label};groups.push(group);exact.set(location,group);cells.set(cell,group);record(boxes);
 }
 return groups;
}
