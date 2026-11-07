import {officialConditionWeight} from './official-conditions.mjs';

// Integrate proximity costs over the portion of each polyline inside 2 m of
// an observation. Activity classifications affect preference, not severity.
// The local multiplier is capped at 2 even when several buffers overlap.
export function officialConditionCostFactor(line, observations) {
 const xy=([lat,lon])=>[lon*100700,lat*111195];
 let total=0,cost=0;
 for(let i=1;i<line.length;i++){
  const [ax,ay]=xy(line[i-1]),[bx,by]=xy(line[i]),dx=bx-ax,dy=by-ay,L=Math.hypot(dx,dy);
  if(!Number.isFinite(L)||L<=0)continue;
  total+=L;
  const events=[];
  for(const point of observations){
   const [px,py]=xy([point.lat,point.lon]),along=((px-ax)*dx+(py-ay)*dy)/L;
   const perpendicular=Math.abs((px-ax)*dy-(py-ay)*dx)/L;
   if(!Number.isFinite(along)||perpendicular>=2)continue;
   const half=Math.sqrt(Math.max(0,4-perpendicular*perpendicular));
   const start=Math.max(0,along-half),end=Math.min(L,along+half);
   if(end<=start)continue;
   const weight=.175*officialConditionWeight(point);
   events.push([start,weight],[end,-weight]);
  }
  events.sort((a,b)=>a[0]-b[0]);
  let previous=0,active=0;
  for(const [position,delta] of events){cost+=(position-previous)*Math.min(2,Math.max(0,active));active+=delta;previous=position;}
 }
 return total>0 ? cost/total : 0;
}

// The baseline weightedCost already includes connectors and optimiser terms.
// Add only the official preference omitted during baseline search, including
// its contribution to the avoid-point multiplier, without re-summing the
// display breakdown (which does not include optimiser-only penalties).
export function restoreOfficialConditionCost(graph, route, options={}) {
 if(!graph?.officialConditionIndex || !Array.isArray(route?.edgeIds) || !Number.isFinite(route.weightedCost))return null;
 let preference=0,avoid=0;
 for(const id of route.edgeIds){
  const edge=graph.edges?.[id],way=edge&&graph.ways?.[edge[3]],a=edge&&graph.nodes?.[edge[0]],b=edge&&graph.nodes?.[edge[1]];
  if(!way||!a||!b||!Number.isFinite(edge[2])||edge[2]<=0)return null;
  if(!['footway','path','pedestrian','corridor'].includes(way.highway))continue;
  const line=[a,...(edge[4]||[]),b],points=graph.officialConditionIndex.find(line,2);
  const added=officialConditionCostFactor(line,points)*edge[2];
  preference+=added;
  const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
  if(options.avoidPoints?.some(p=>Math.hypot((mid[0]-p[0])*111195,(mid[1]-p[1])*100700)<=25))avoid+=added*7;
 }
 const costBreakdown=route.costBreakdown?{...route.costBreakdown,officialCondition:(route.costBreakdown.officialCondition||0)+preference,avoidPoint:(route.costBreakdown.avoidPoint||0)+avoid}:route.costBreakdown;
 return {...route,weightedCost:route.weightedCost+preference+avoid,...(costBreakdown?{costBreakdown}:{} )};
}
