import {constructionFresh} from './construction.mjs';
import {planImprovedPlaces} from './pedestrian-planning.mjs';

// A geometric buffer avoids the mapped point, not proof of an actual obstacle,
// and may include another side of the road. Never call a partial route a detour.
export function planConditionDetour(start,end,options,snapshot,{graph,router,verifyLocal,facilities,checker},targets){
 if(!constructionFresh(snapshot))return {error:'CONSTRUCTION_UNAVAILABLE'};
 const index=graph.officialConditionIndex;
 if(!index||!Array.isArray(targets)||!targets.length||targets.length>40)return {error:'OFFICIAL_CONDITION_UNAVAILABLE'};
 const keys=new Set();
 for(const target of targets){
  const point=index.get(target?.type,target?.id);
  if(!point||!Number.isFinite(target.lat)||!Number.isFinite(target.lon)||Math.abs(point.lat-target.lat)>1e-7||Math.abs(point.lon-target.lon)>1e-7)return {error:'OFFICIAL_CONDITION_UNAVAILABLE'};
  keys.add(`${point.type}:${point.id}`);
 }
 const matches=line=>index.find(line,10).some(p=>keys.has(`${p.type}:${p.id}`));
 const detourChecker={...checker,allowed:line=>checker.allowed(line)&&!matches(line)};
 const result=planImprovedPlaces(start,end,options,snapshot,{graph,router,verifyLocal,facilities,checker:detourChecker});
 if(!constructionFresh(snapshot))return {error:'CONSTRUCTION_UNAVAILABLE'};
 if(result.error||!result.coordinates||matches(result.coordinates)||checker.inspect(result.coordinates).blocked.length)return {error:'NO_CONDITION_DETOUR'};
 return {...result,conditionDetour:{targets:targets.map(({type,id,lat,lon})=>({type,id,lat,lon})),radiusMetres:10}};
}
