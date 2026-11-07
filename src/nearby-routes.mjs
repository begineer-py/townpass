import {edgeAllowed,metres} from './routing.mjs';
import {constructionFresh} from './construction.mjs';
import {planPlaces} from './local-route-verifier.mjs';

// An alternative is a ground pedestrian-network node, not an entrance and not
// a claim that the original point can be reached from it.
export function createNearbyRoutes(graph,{router,verifyLocal,facilities}){
 const grid=new Map(),nodeEdges=new Map(),cell=.001;
 for(let i=0;i<graph.edges.length;i++){
  const e=graph.edges[i],w=graph.ways[e[3]];
  if(!['footway','path','pedestrian','corridor'].includes(w.highway)||w.gradeSeparatedPedestrian||
     (w.bridge&&w.bridge!=='no')||(w.tunnel&&w.tunnel!=='no')||
     (w.layer!=null&&String(w.layer)!=='0')||(w.level!=null&&String(w.level)!=='0'))continue;
  for(const n of e.slice(0,2)){
   if(graph.nodes[n][2])continue;
   if(!nodeEdges.has(n)){nodeEdges.set(n,[]);const p=graph.nodes[n],key=`${Math.floor(p[0]/cell)},${Math.floor(p[1]/cell)}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(n);}
   nodeEdges.get(n).push(i);
  }
 }
 return function findNearby(startPlace,endPlace,options,snapshot,checker,{radius=80,maxResults=3,maxAttempts=12,maxMs=10000}={}){
  if(!constructionFresh(snapshot))return {error:'CONSTRUCTION_UNAVAILABLE'};
  const result=[];let attempts=0,truncated=false;
  for(const side of ['start','end']){
   const sideStarted=Date.now();
   const original=side==='start'?startPlace:endPlace;
   if(!Number.isFinite(original?.lat)||!Number.isFinite(original?.lon))return {error:'OFFICIAL_INVALID_POINTS'};
   const point=[original.lat,original.lon],ys=radius/111195,xs=radius/100700,pool=[];
   for(let y=Math.floor((point[0]-ys)/cell);y<=Math.floor((point[0]+ys)/cell);y++)
    for(let x=Math.floor((point[1]-xs)/cell);x<=Math.floor((point[1]+xs)/cell);x++)
     for(const index of grid.get(`${y},${x}`)||[]){
      const n=graph.nodes[index],d=metres(point,n);
      if(d<=.05||d>radius||n[2]||!nodeEdges.get(index).some(i=>{const e=graph.edges[i];return !graph.nodes[e[0]][2]&&!graph.nodes[e[1]][2]&&edgeAllowed(graph.ways[e[3]],options,e[5]);}))continue;
      pool.push({index,d});
     }
   pool.sort((a,b)=>a.d-b.d||a.index-b.index);let sideCount=0,sideAttempts=0;const accepted=[];
   for(const item of pool){
    if(sideAttempts>=maxAttempts||Date.now()-sideStarted>=maxMs){truncated=true;break;}
    const n=graph.nodes[item.index],coordinate=n.slice(0,2);
    if(accepted.some(p=>metres(p,coordinate)<10))continue;
    const pointPlace={id:`nearby-network-${item.index}`,name:'附近人行路網位置',lat:n[0],lon:n[1]};
    const start=side==='start'?pointPlace:startPlace,end=side==='end'?pointPlace:endPlace;
    sideAttempts++;attempts++;
    const route=planPlaces(start,end,options,snapshot,{router,verifyLocal,facilities,checker});
    if(route.error)continue;
    // Keep only the candidate point and straight-line separation. The original
    // POI and candidate must never be connected by a fabricated line.
    result.push({side,point:pointPlace,straightMetres:Math.round(item.d),routeDistance:route.distance});
    accepted.push(coordinate);if(++sideCount>=maxResults)break;
   }
  }
  if(!constructionFresh(snapshot))return {error:'CONSTRUCTION_UNAVAILABLE'};
  return {candidates:result,attempts,truncated,sourceUpdatedAt:snapshot.sourceUpdatedAt};
 };
}
