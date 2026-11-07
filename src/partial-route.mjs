import {metres,ROUTING_POLICY} from './routing.mjs';
import {constructionFresh} from './construction.mjs';

// Publish only individually verified graph walks. The separation is metadata,
// never a line joining the walks or a statement that the missing area is safe.
export function verifiedPartialRoute(diagnostic,start,end,options,snapshot,{verifyLocal,checker,resolvedStart,resolvedEnd}){
 if(!['NO_ROUTE','NO_CONNECTION'].includes(diagnostic?.error)||!constructionFresh(snapshot)||!Array.isArray(diagnostic?.partialCandidates))return null;
 const segments=[];
 for(const item of diagnostic.partialCandidates){
  if(!['start','end'].includes(item.side)||segments.some(s=>s.side===item.side)||!Array.isArray(item.point))continue;
  const a=item.side==='start'?start:item.point,b=item.side==='start'?item.point:end;
  const prefs={...options,startPlace:item.side==='start'?options.startPlace:null,endPlace:item.side==='end'?options.endPlace:null};
  const checked=verifyLocal(item.route,a,b,prefs);
  if(checked.error||checked.geometryVerification!=='pedestrian-network-v1'||checked.policyVersion!==ROUTING_POLICY)continue;
  const construction=checker.inspect(checked.coordinates);
  if(construction.blocked.length||!constructionFresh(snapshot))continue;
  segments.push({...checked,side:item.side,construction});
 }
 if(!segments.length||!constructionFresh(snapshot))return null;
 const left=segments.find(s=>s.side==='start'),right=segments.find(s=>s.side==='end');
 const startSide=left?.networkCoordinates?.at(-1)||null,endSide=right?.networkCoordinates?.[0]||null;
 if((left&&!startSide)||(right&&!endSide))return null;
 const gap={kind:left&&right?'between-network':left?'missing-end':'missing-start',startSide,endSide,
  straightMetres:Math.round(metres(startSide||start,endSide||end))};
 return {complete:false,policyVersion:ROUTING_POLICY,constructionSourceUpdatedAt:snapshot.sourceUpdatedAt,segments,gap,resolvedStart,resolvedEnd};
}

