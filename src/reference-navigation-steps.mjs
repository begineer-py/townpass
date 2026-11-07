import {metres} from './routing.mjs';

// Build readable directions only from screened geometry. Tiny connectors are
// accounted for in distance but do not define a new direction; their bearing
// is often just survey alignment rather than a real turn on the walking path.
export function referenceNavigationSteps(segments){
 const steps=[];let anchor=null,pendingDistance=0,pendingStart=null,pendingUnconfirmed=false;
 const turnFor=heading=>{if(anchor==null)return '直行';const delta=((heading-anchor+540)%360)-180;return Math.abs(delta)>150?'迴轉':delta>35?'右轉':delta< -35?'左轉':'直行';};
 const resetPending=()=>{pendingDistance=0;pendingStart=null;pendingUnconfirmed=false;};
 for(const segment of segments){
  const lengths=segment.coordinates.slice(1).map((p,i)=>metres(segment.coordinates[i],p)),sum=lengths.reduce((a,b)=>a+b,0);
  for(let i=0;i<lengths.length;i++){
   const a=segment.coordinates[i],b=segment.coordinates[i+1],length=lengths[i],amount=sum?segment.distanceMetres*length/sum:0;
   const join=segment.kind==='source-join'||segment.kind==='osm-join',approach=segment.kind==='endpoint-approach';
   if(join||length<.5||amount<.5){if(!pendingStart)pendingStart=a;pendingDistance+=amount;if(join||approach)pendingUnconfirmed=true;continue;}
   const heading=(Math.atan2((b[1]-a[1])*100700,(b[0]-a[0])*111195)*180/Math.PI+360)%360;
   const turn=approach?'直行':turnFor(heading),name=segment.kind==='official-line'?'官方通行線':segment.kind==='osm'?(segment.roadName||'人行路段'):'起終點估算銜接';
   const previous=steps.at(-1),sameRoad=!approach&&previous?.kind===segment.kind&&previous.name===name&&previous.sharedRoad===(segment.sharedRoad===true);
   if(sameRoad&&turn==='直行'){
    previous.distance+=pendingDistance+amount;
    if(pendingUnconfirmed)previous.access='unconfirmed';
    // A merged step can cover multiple source records; the route segments
    // retain exact provenance, while a single ID here would be misleading.
    delete previous.qgsFid;delete previous.partIndex;delete previous.segmentIndex;delete previous.edgeId;
   }else{
    const start=pendingStart||a;
    steps.push({name,turn,lat:start[0],lon:start[1],distance:pendingDistance+amount,kind:segment.kind,unknown:true,
     access:approach||pendingUnconfirmed?'unconfirmed':undefined,qgsFid:segment.qgsFid,partIndex:segment.partIndex,segmentIndex:segment.segmentIndex,edgeId:segment.edgeId,sharedRoad:segment.sharedRoad===true});
    if(!approach)anchor=heading;
   }
   resetPending();
  }
 }
 if(pendingDistance>0){
  if(steps.length){steps.at(-1).distance+=pendingDistance;if(pendingUnconfirmed)steps.at(-1).access='unconfirmed';}
  else steps.push({name:'起終點估算銜接',turn:'直行',lat:pendingStart[0],lon:pendingStart[1],distance:pendingDistance,kind:'endpoint-approach',unknown:true,access:'unconfirmed',sharedRoad:false});
 }
 return steps;
}
