import {useEffect,useRef} from 'react';
import L from 'leaflet';
import {CONSTRUCTION_MAX_AGE} from './construction.mjs';
import {constructionLabel,selectVisibleConstruction,createConstructionRedrawGate,constructionMarkerVisible} from './construction-layer.mjs';
import constructionIcon from './construction-icon.svg';
import './construction-layer.css';

const colors={blocked:'#912522',unknown:'#74521B',clear:'#5E6D76'};
function popupContent(work,geometry,sourceUpdatedAt,count=1,ids=[],onAvoid=null,avoiding=false){
 const root=document.createElement('div'),title=document.createElement('strong');
 title.textContent=constructionLabel(work,geometry);root.append(title);
 const add=text=>{if(!text)return;const line=document.createElement('div');line.textContent=String(text).slice(0,180);root.append(line);};
 add(work.address||'施工通報位置');if(count>1)add(`同一工程 ${count} 筆通報`);
 if(work.start||work.end)add(`通報日期：${work.start||'未提供'} 至 ${work.end||'未提供'}`);
 if(work.hours)add(`施工時間：${work.hours}`);
 if(geometry.type!=='Polygon')add('影響範圍尚未確認');
 const updated=Date.parse(sourceUpdatedAt);if(Number.isFinite(updated))add(`資料更新：${new Date(updated).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}`);
 if(work.impact==='clear'&&onAvoid){const button=document.createElement('button');button.type='button';button.className='construction-avoid';button.textContent='繞過施工';button.disabled=avoiding;button.addEventListener('click',()=>{button.disabled=true;onAvoid(ids);});root.append(button);}
 return root;
}
function iconFor(work){
 const label=document.createElement('span');label.className=`construction-pin construction-pin--${['blocked','clear'].includes(work.impact)?work.impact:'unknown'}`;
 const image=document.createElement('img');image.src=constructionIcon;image.alt='';image.setAttribute('aria-hidden','true');label.append(image);
 return L.divIcon({className:'construction-marker-shell',html:label,iconSize:[34,34],iconAnchor:[17,17],popupAnchor:[0,-17]});
}
// A dedicated viewport layer. It does not participate in route planning or
// infer that any point/line is an exact work-zone boundary.
export function useConstructionLayer(mapRef,snapshot,show,onStatus=()=>{},priorityIds=[],priorityOnly=false,onAvoid=null,avoiding=false){
 const callback=useRef(onStatus);callback.current=onStatus;
 const avoidCallback=useRef(onAvoid);avoidCallback.current=onAvoid;
 const priorityKey=JSON.stringify(Array.isArray(priorityIds)?priorityIds.map(String).sort():[]);
 useEffect(()=>{
  const map=mapRef.current;
  if(!map)return;
  if(!show){callback.current({status:'hidden',shown:0,total:0,truncated:false});return;}
  const shapePane=map.getPane('construction-work')||map.createPane('construction-work',map.getPane('rotatePane')||undefined);
  shapePane.style.zIndex='370';
  const markerPane=map.getPane('construction-markers')||map.createPane('construction-markers',map.getPane('rotatePane')||undefined);
  markerPane.style.zIndex='610';
  const renderer=L.canvas({pane:'construction-work',padding:.2}),layer=L.layerGroup().addTo(map);
  let active=true,expiryTimer;
  function draw(){
   if(!active||mapRef.current!==map)return;
   layer.clearLayers();
   const b=map.getBounds(),result=selectVisibleConstruction(snapshot,[b.getSouth(),b.getWest(),b.getNorth(),b.getEast()],Date.now(),200,600,JSON.parse(priorityKey),priorityOnly);
   callback.current({status:result.status,shown:result.items.length,total:result.total,truncated:result.truncated});
   if(result.status!=='ready')return;
   for(const {work,geometries,point,anchorGeometry,count,ids} of result.items){
    const avoid=onAvoid?ids=>avoidCallback.current?.(ids):null;
    const color=colors[work.impact]||colors.unknown;
    for(const geometry of geometries){
     const opts={pane:'construction-work',renderer,color,weight:3,opacity:.9};
     const shape=geometry.type==='Polygon'?L.polygon(geometry.coordinates,{...opts,fillColor:color,fillOpacity:.14}):geometry.type==='LineString'?L.polyline(geometry.coordinates,{...opts,dashArray:'8 6'}):null;
     if(shape)shape.bindPopup(popupContent(work,geometry,snapshot.sourceUpdatedAt,count,ids,avoid,avoiding),{autoPanPaddingTopLeft:[20,20],autoPanPaddingBottomRight:[80,20]}).addTo(layer);
    }
    if(!constructionMarkerVisible(map.getZoom()))continue;
    const label=constructionLabel(work,anchorGeometry);
    const marker=L.marker(point,{pane:'construction-markers',icon:iconFor(work),title:label,alt:label,keyboard:true}).bindTooltip(label,{direction:'top',offset:[0,-14]}).bindPopup(popupContent(work,anchorGeometry,snapshot.sourceUpdatedAt,count,ids,avoid,avoiding),{autoPanPaddingTopLeft:[20,20],autoPanPaddingBottomRight:[80,20]}).addTo(layer);
    marker.getElement()?.setAttribute('aria-label',`${label}：${work.address||'施工通報位置'}`);
   }
  }
  const gate=createConstructionRedrawGate({redraw:draw});
  const popupOpen=event=>{if(layer.hasLayer(event.popup?._source))gate.open(event.popup);};
  const popupClose=event=>gate.close(event.popup);
  map.on('moveend',gate.move);map.on('zoomend',gate.expire);map.on('rotate',gate.move);
  map.on('popupopen',popupOpen);map.on('popupclose',popupClose);
  draw();
  const fetched=Date.parse(snapshot?.fetchedAt),source=Date.parse(snapshot?.sourceUpdatedAt),expires=Math.min(fetched,source)+CONSTRUCTION_MAX_AGE-Date.now();
  if(Number.isFinite(expires)&&expires>0)expiryTimer=setTimeout(gate.expire,expires+20);
  return ()=>{active=false;gate.dispose();clearTimeout(expiryTimer);map.off('moveend',gate.move);map.off('zoomend',gate.expire);map.off('rotate',gate.move);map.off('popupopen',popupOpen);map.off('popupclose',popupClose);layer.remove();renderer.remove();};
 },[mapRef,snapshot,show,priorityKey,priorityOnly,!!onAvoid,avoiding]);
}
