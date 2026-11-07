import {planPlaces} from './local-route-verifier.mjs';
import {edgeAllowed,metres} from './routing.mjs';
import {constructionFresh} from './construction.mjs';
import {roadConnectorChecker} from './geometry.mjs';
import {officialGeometryEvidence} from './supplemental-evidence.mjs';

// An alternative is a ground walking-network point on an existing edge,
// not an entrance or a claim that the original point can be reached from it.
export function createNearbyRoutes(graph,{router,verifyLocal,facilities}){
 const grid=new Map(),cell=.001,roadClear=roadConnectorChecker(graph.roadGeometries,officialGeometryEvidence(graph).crossings);
 for(let i=0;i<graph.edges.length;i++){
  const e=graph.edges[i],w=graph.ways[e[3]];
  const pedestrian=['footway','path','pedestrian','corridor'].includes(w.highway);
  const shared=w.source==='osm-shared-street'&&['living_street','residential','unclassified','service'].includes(w.highway);
  if((!pedestrian&&!shared)||w.gradeSeparatedPedestrian||
     (w.bridge&&w.bridge!=='no')||(w.tunnel&&w.tunnel!=='no')||
     (w.layer!=null&&String(w.layer)!=='0')||(w.level!=null&&String(w.level)!=='0'))continue;
  if(graph.nodes[e[0]][2]||graph.nodes[e[1]][2])continue;
  const line=[graph.nodes[e[0]],...(e[4]||[]),graph.nodes[e[1]]],ys=line.map(p=>p[0]),xs=line.map(p=>p[1]);
  for(let y=Math.floor(Math.min(...ys)/cell);y<=Math.floor(Math.max(...ys)/cell);y++)for(let x=Math.floor(Math.min(...xs)/cell);x<=Math.floor(Math.max(...xs)/cell);x++){
   const key=`${y},${x}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(i);
  }
 }
 return function findNearby(startPlace,endPlace,options,snapshot,checker,{radius=80,maxResults=3,maxAttempts=200,maxMs=10000, includeOuter=false}={}){
  if(!constructionFresh(snapshot))return {error:'CONSTRUCTION_UNAVAILABLE'};
  const result=[];let attempts=0,truncated=false;
  for(const side of ['start','end']){
   const sideStarted=Date.now();
   const original=side==='start'?startPlace:endPlace;
   if(!Number.isFinite(original?.lat)||!Number.isFinite(original?.lon))return {error:'OFFICIAL_INVALID_POINTS'};
   const point=[original.lat,original.lon],ys=radius/111195,xs=radius/100700,pool=[];
   let blockerDistance=Infinity;
   for(const n of graph.nodes)if(n[2]){const d=metres(point,n);if(d<blockerDistance)blockerDistance=d;}
   const edgeIds=new Set();
   for(let y=Math.floor((point[0]-ys)/cell);y<=Math.floor((point[0]+ys)/cell);y++)
    for(let x=Math.floor((point[1]-xs)/cell);x<=Math.floor((point[1]+xs)/cell);x++)
     for(const index of grid.get(`${y},${x}`)||[])edgeIds.add(index);
   for(const index of edgeIds){
    const e=graph.edges[index],w=graph.ways[e[3]];
    if(graph.nodes[e[0]][2]||graph.nodes[e[1]][2]||!edgeAllowed(w,options,e[5]))continue;
    const line=[graph.nodes[e[0]],...(e[4]||[]),graph.nodes[e[1]]];
    for(let j=1;j<line.length;j++){
     const a=line[j-1],b=line[j],dy=(b[0]-a[0])*111195,dx=(b[1]-a[1])*100700;
     const t=Math.max(0,Math.min(1,((point[0]-a[0])*111195*dy+(point[1]-a[1])*100700*dx)/(dy*dy+dx*dx||1)));
     const projection=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
     // The nearest projected point may be blocked while a segment endpoint is
     // reachable on the same side of a street. Check those real points too.
     for(const [variant,coordinate] of [['projection',projection],['a',a.slice(0,2)],['b',b.slice(0,2)]]){
      const d=metres(point,coordinate);if(d>.05&&d<=radius&&d<blockerDistance)pool.push({index,segment:j-1,variant,coordinate,d});
     }
    }
   }
   pool.sort((a,b)=>a.d-b.d||a.index-b.index||a.segment-b.segment);let sideCount=0,sideAttempts=0,interrupted=false;const accepted=[],tried=new Set();
   // Search 50m first; only a fully exhausted empty inner radius permits the
   // wider search. Candidates are detached positions, not verified routes.
   for(const limit of [Math.min(50,radius),radius]){
    if((sideCount && !includeOuter)||interrupted)break;
    let radiusCount = 0;
    for(const item of pool){
     if(item.d>limit||(limit>50&&item.d<=50))continue;
     if(sideAttempts>=maxAttempts||Date.now()-sideStarted>=maxMs){truncated=true;interrupted=true;break;}
     const coordinate=item.coordinate;
     const key=coordinate.map(x=>x.toFixed(9)).join(',');if(tried.has(key))continue;tried.add(key);
     if(accepted.some(p=>metres(p,coordinate)<10))continue;
     sideAttempts++;attempts++;
     if(!roadClear(point,coordinate)||!checker.allowed([point,coordinate]))continue;
     const shared=graph.ways[graph.edges[item.index][3]].source==='osm-shared-street';
     const pointPlace={id:`nearby-edge-${item.index}-${item.segment}-${item.variant}`,name:shared?'附近人車共行路網位置':'附近人行路網位置',lat:coordinate[0],lon:coordinate[1],...(shared?{nearbyNetwork:'shared'}:{})};
     // Do not claim that this is an entrance, that the original point can be
     // reached, or that the full route to the other endpoint has been tested.
     result.push({side,point:pointPlace,straightMetres:Math.round(item.d),routeVerified:false,routeDistance:null,searchRadius:limit});
     accepted.push(coordinate);sideCount++;if(++radiusCount>=maxResults)break;
    }
    if(limit===radius)break;
   }
  }
  if(!constructionFresh(snapshot))return {error:'CONSTRUCTION_UNAVAILABLE'};
  return {candidates:result,attempts,truncated,sourceUpdatedAt:snapshot.sourceUpdatedAt};
 };
}

// Try changing one endpoint first. If neither side alone can connect,
// try both replacements. Keep the original-to-replacement gaps off the route.
export function verifyNearbyRoutes(nearby, startPlace, endPlace, options, snapshot, deps) {
 function replacements(side, original) {
  const ground = nearby.candidates.filter(candidate => candidate.side === side);
  const entrances = deps.facilities.filter(point => point.kind === 'metro-elevator' && point.id !== original.id)
   .map(point => ({ side, point, straightMetres: Math.round(metres([original.lat, original.lon], [point.lat, point.lon])) }))
   .filter(candidate => candidate.straightMetres > 0 && candidate.straightMetres <= 150)
   .sort((a,b) => a.straightMetres - b.straightMetres).slice(0, 2);
  return [...ground, ...entrances];
 }
 const starts = replacements('start', startPlace);
 const ends = replacements('end', endPlace);
 const singles = [
  ...starts.map(start => ({ start })),
  ...ends.map(end => ({ end })),
 ];
 const pairs = starts.flatMap(start => ends.map(end => ({ start, end })));
 const distanceMoved = ({start, end}) => (start?.straightMetres ?? 0) + (end?.straightMetres ?? 0);
 const candidates = [];
 const deadline = Date.now() + 12000;
 let truncated = nearby.truncated;
 for (const group of [singles, pairs]) {
  for (const choice of group.sort((a,b) => distanceMoved(a) - distanceMoved(b))) {
   if (Date.now() >= deadline) { truncated = true; break; }
   if (!constructionFresh(snapshot)) return { error: 'CONSTRUCTION_UNAVAILABLE' };
   let route;
   try{route=planPlaces(choice.start?.point || startPlace, choice.end?.point || endPlace, options, snapshot, deps);}
   catch(error){
    if(error?.code!=='PROJECTION_LIMIT'||!candidates.length)throw error;
    if(!constructionFresh(snapshot))return {error:'CONSTRUCTION_UNAVAILABLE'};
    return {...nearby,candidates,truncated:true,searchStatus:'projection-limit'};
   }
   if (route.error || !Number.isFinite(route.distance)) continue;
   candidates.push({ ...choice, route });
   if (candidates.length === 2) break;
  }
  if (candidates.length || Date.now() >= deadline) break;
 }
 if (!constructionFresh(snapshot)) return { error: 'CONSTRUCTION_UNAVAILABLE' };
 return { ...nearby, candidates, truncated };
}
