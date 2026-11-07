import {constructionFresh} from './construction.mjs';

const point=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
const same=(a,b)=>point(a)&&point(b)&&Math.abs(a[0]-b[0])<1e-8&&Math.abs(a[1]-b[1])<1e-8;
const line=a=>Array.isArray(a)&&a.length>=2&&a.every(point);

// Accept only separately verified legs from the current worker/snapshot. This
// presentation object never includes a line joining the two components.
export function partialRoutePresentation(error,partial,snapshot,policy,now=Date.now(),selectedEndpoints=null){
 if(!['NO_ROUTE','NO_CONNECTION'].includes(error)||partial?.complete!==false||partial.policyVersion!==policy||
    !constructionFresh(snapshot,now)||partial.constructionSourceUpdatedAt!==snapshot.sourceUpdatedAt||
    !Array.isArray(partial.segments)||!partial.segments.length||partial.segments.length>2)return null;
 const seen=new Set(),segments=[];
 for(const s of partial.segments){
  if(!s||!['start','end'].includes(s.side)||seen.has(s.side)||s.policyVersion!==policy||
     s.geometryVerification!=='pedestrian-network-v1'||!line(s.coordinates)||!line(s.networkCoordinates)||
     !Array.isArray(s.approaches)||!Number.isFinite(s.distance)||s.distance<0||
     !Array.isArray(s.construction?.blocked)||s.construction.blocked.length||s.construction.sourceUpdatedAt!==snapshot.sourceUpdatedAt)return null;
  seen.add(s.side);
  // The verified network must be a contiguous part of the leg's display line;
  // any extra endpoint must have its own explicit verified/estimated approach.
  const offset=same(s.coordinates[0],s.networkCoordinates[0])?0:1;
  const tail=s.coordinates.length-offset-s.networkCoordinates.length;
  if(tail<0||tail>1||offset>1||s.networkCoordinates.some((p,i)=>!same(p,s.coordinates[i+offset])))return null;
  for(const a of s.approaches){if(!a||!['start','end'].includes(a.side)||!line(a.coordinates)||
      (a.estimated!==true&&a.estimated!==false)||
      ((a.unconfirmed===true||a.entryStatus==='unconfirmed')&&a.estimated!==true))return null;}
  if(offset&&!s.approaches.some(a=>a.side==='start'&&same(a.coordinates[0],s.coordinates[0])&&same(a.coordinates.at(-1),s.networkCoordinates[0])))return null;
  if(tail&&!s.approaches.some(a=>a.side==='end'&&same(a.coordinates[0],s.networkCoordinates.at(-1))&&same(a.coordinates.at(-1),s.coordinates.at(-1))))return null;
  let tiers=[];
  if(Array.isArray(s.tierSegments)&&s.tierSegments.length&&s.tierSegments.every((t,i)=>line(t?.coordinates)&&(!i||same(s.tierSegments[i-1].coordinates.at(-1),t.coordinates[0])))){
   const flattened=[s.tierSegments[0].coordinates[0],...s.tierSegments.flatMap(t=>t.coordinates.slice(1))];
   if(flattened.length===s.networkCoordinates.length&&flattened.every((p,i)=>same(p,s.networkCoordinates[i])))tiers=s.tierSegments;
  }
  segments.push({...s,tierSegments:tiers});
 }
 let gap=partial.gap;
 if(!gap||!['between-network','missing-start','missing-end'].includes(gap.kind))return null;
 const start=segments.find(s=>s.side==='start'),end=segments.find(s=>s.side==='end');
 if(gap.kind==='between-network'&&(!start||!end||!point(gap.startSide)||!point(gap.endSide)))return null;
 if(gap.kind==='missing-start'&&(start||!end||gap.startSide!=null||!point(gap.endSide)))return null;
 if(gap.kind==='missing-end'&&(!start||end||!point(gap.startSide)||gap.endSide!=null))return null;
 if(start&&!same(start.networkCoordinates.at(-1),gap.startSide))return null;
 if(end&&!same(end.networkCoordinates[0],gap.endSide))return null;
 // A via-leg diagnostic may start at the via rather than the user's original
 // start. Do not label it as a start-side path unless its provenance matches.
 const matched=segments.filter(s=>{
  if(!selectedEndpoints)return true;
  const chosen=s.side==='start'?partial.resolvedStart||selectedEndpoints.start:partial.resolvedEnd||selectedEndpoints.end;
  if(!chosen||!Number.isFinite(chosen.lat)||!Number.isFinite(chosen.lon))return false;
  return same(s.side==='start'?s.coordinates[0]:s.coordinates.at(-1),[chosen.lat,chosen.lon]);
 });
 if(!matched.length)return null;
 if(matched.length!==segments.length){
  const l=matched.find(s=>s.side==='start'),r=matched.find(s=>s.side==='end');
  gap={...gap,kind:l?'missing-end':'missing-start',startSide:l?gap.startSide:null,endSide:r?gap.endSide:null};
 }
 return {complete:false,segments:matched,gap,resolvedStart:partial.resolvedStart,resolvedEnd:partial.resolvedEnd,
  constructionSourceUpdatedAt:partial.constructionSourceUpdatedAt,constructionFetchedAt:snapshot.fetchedAt,
  message:'目前只有部分路段可規劃，缺口尚未連接；這不是完整路線，尚未找到從原起點抵達原目的地的走法。'};
}
