import proj4 from 'proj4';
import {referenceNavigationSteps} from './reference-navigation-steps.mjs';
export {referenceNavigationSteps} from './reference-navigation-steps.mjs';
import {constructionFresh,createConstructionChecker} from './construction.mjs';
import {roadConnectorChecker,polygonConnectorChecker} from './geometry.mjs';
import {officialGeometryEvidence} from './supplemental-evidence.mjs';
import {edgeAllowed,metres,ROUTING_POLICY} from './routing.mjs';

const TWD97='+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs';
const valid=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=24.9&&p[0]<=25.3&&p[1]>=121.4&&p[1]<=121.8;
const same=(a,b)=>valid(a)&&valid(b)&&metres(a,b)<=.01;
const interpolate=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
const toLL=p=>{const [lon,lat]=proj4(TWD97,'EPSG:4326',p);return [lat,lon];};
const distanceToSegment=(p,a,b)=>{const dy=(b[0]-a[0])*111195,dx=(b[1]-a[1])*100700,py=(p[0]-a[0])*111195,px=(p[1]-a[1])*100700,t=Math.max(0,Math.min(1,(py*dy+px*dx)/(dy*dy+dx*dx||1)));return metres(p,interpolate(a,b,t));};
const invalid=()=>({error:'REFERENCE_VALIDATION_FAILED'});

// Independent second pass over the authenticated source and original graph.
// It screens the proposed geometry; it cannot establish real-world grade,
// road side, access, accessibility or the completeness of source records.
export function verifyOfficialReferenceRoute({route,parts,sourceHash,graph,snapshot,verifyLocal,start,end,startPlace,endPlace,options={},maxMs=15000}){
 const deadline=Date.now()+maxMs;
 if(!constructionFresh(snapshot))return {error:'CONSTRUCTION_UNAVAILABLE'};
 if(!valid(start)||!valid(end)||options.knownOnly||!Array.isArray(parts)||parts.length>10000||(graph.nodes?.length||0)>2000000||!/^[a-f0-9]{64}$/i.test(sourceHash||'')||route?.sourceHash!==sourceHash||route?.source!=='official-passageway'||route?.constructionSourceUpdatedAt!==snapshot.sourceUpdatedAt||!Array.isArray(route.segments)||route.segments.length<1||route.segments.length>10000||!Number.isFinite(route.distanceMetres)||route.distanceMetres<0)return invalid();
 if(!verifyLocal?.endpointAllowed?.(start,startPlace,'start')||!verifyLocal?.endpointAllowed?.(end,endPlace,'end'))return invalid();
 let checker,evidence;try{checker=createConstructionChecker(snapshot);evidence=officialGeometryEvidence(graph);}catch{return invalid();}
 const road=roadConnectorChecker(graph.roadGeometries,evidence.crossings),sourceRoad=road.withCrossingTolerance(.25),area=polygonConnectorChecker(evidence.areas);
 const source=new Map();
 let vertices=0;for(const part of parts){if(Date.now()>deadline)return {error:'REFERENCE_VALIDATION_LIMIT'};vertices+=part.coordinates?.length||0;if(vertices>200000)return {error:'REFERENCE_VALIDATION_LIMIT'};const key=`${part.qgsFid}:${part.partIndex}`;if(source.has(key)||!/^\d+$/.test(String(part.qgsFid))||!Number.isSafeInteger(part.partIndex)||!Array.isArray(part.coordinates)||part.coordinates.length<2)return invalid();source.set(key,part);}
 const cell=.001,grid=new Map(),key=(y,x)=>`${y},${x}`;
 for(const n of graph.nodes||[]){if(Date.now()>deadline)return {error:'REFERENCE_VALIDATION_LIMIT'};if(n[2]&&valid(n.slice(0,2))){const k=key(Math.floor(n[0]/cell),Math.floor(n[1]/cell));if(!grid.has(k))grid.set(k,[]);grid.get(k).push(n.slice(0,2));}}
 const avoid=options.avoidPoints??[];if(!Array.isArray(avoid)||avoid.some(p=>!valid(p))||avoid.length>10000)return invalid();
 function blocked(a,b,radius=.5){
  const lat=radius/111195,lon=radius/100700;
  for(let y=Math.floor((Math.min(a[0],b[0])-lat)/cell);y<=Math.floor((Math.max(a[0],b[0])+lat)/cell);y++)for(let x=Math.floor((Math.min(a[1],b[1])-lon)/cell);x<=Math.floor((Math.max(a[1],b[1])+lon)/cell);x++)for(const p of grid.get(key(y,x))||[])if(distanceToSegment(p,a,b)<=radius)return true;
  return false;
 }
 const checkLine=(coords,roadCheck)=>{
  if(!Array.isArray(coords)||coords.length<2||coords.some(p=>!valid(p))||!checker.allowed(coords))return false;
  for(let i=1;i<coords.length;i++)if(Date.now()>deadline||(roadCheck&&!roadCheck(coords[i-1],coords[i]))||blocked(coords[i-1],coords[i])||avoid.some(p=>distanceToSegment(p,coords[i-1],coords[i])<=25))return false;
  return true;
 };
 function part(fid,index){const p=source.get(`${fid}:${index}`);if(!p||(p.bridge&&p.bridge!=='no')||(p.tunnel&&p.tunnel!=='no')||(p.layer!=null&&String(p.layer)!=='0')||(p.level!=null&&String(p.level)!=='0')||p.blocked===true)return null;return p;}
 function vertex(p,index,endpoint=false){if(!p||!Number.isSafeInteger(index)||index<0||index>=p.coordinates.length||(endpoint&&index!==0&&index!==p.coordinates.length-1))return null;const xy=p.coordinates[index];if(!Array.isArray(xy)||xy.length!==2||!xy.every(Number.isFinite))return null;const ll=toLL(xy);return valid(ll)?ll:null;}
 function official(fid,pi,si,t){const p=part(fid,pi);if(!Number.isFinite(t)||t<0||t>1)return null;const a=vertex(p,si),b=vertex(p,si+1);return a&&b?{p,a,b,point:interpolate(a,b,t)}:null;}
 function osm(id){
  const e=graph.edges?.[id],w=e&&graph.ways?.[e[3]],a=e&&graph.nodes?.[e[0]],b=e&&graph.nodes?.[e[1]];
  if(!Number.isSafeInteger(id)||id<0||(graph._routeProjectionState?.baseEdges!=null&&id>=graph._routeProjectionState.baseEdges)||!e||e[5]?.derivedFrom!=null||!w||!a||!b||a[2]||b[2]||!edgeAllowed(w,options,e[5])||w.gradeSeparatedPedestrian||(w.bridge&&w.bridge!=='no')||(w.tunnel&&w.tunnel!=='no')||(w.layer!=null&&String(w.layer)!=='0')||(w.level!=null&&String(w.level)!=='0'))return null;
  const line=[a.slice(0,2),...(e[4]||[]),b.slice(0,2)];if(line.some(p=>!valid(p)))return null;
  const offsets=[0];for(let i=1;i<line.length;i++)offsets.push(offsets.at(-1)+metres(line[i-1],line[i]));
  return {e,w,line,offsets,total:offsets.at(-1)};
 }
 function lineAt(o,d){if(!Number.isFinite(d)||d<-.001||d>o.total+.001)return null;d=Math.max(0,Math.min(o.total,d));for(let i=1;i<o.offsets.length;i++)if(d<=o.offsets[i]+1e-8){const length=o.offsets[i]-o.offsets[i-1];return interpolate(o.line[i-1],o.line[i],length?(d-o.offsets[i-1])/length:0);}return o.line.at(-1);}
 function subline(o,lo,hi){const a=lineAt(o,lo),b=lineAt(o,hi);if(!a||!b||hi<lo)return null;return [a,...o.line.slice(1,-1).filter((_,i)=>o.offsets[i+1]>lo+1e-7&&o.offsets[i+1]<hi-1e-7),b];}
 const lineEqual=(a,b)=>Array.isArray(a)&&a.length===b.length&&a.every((p,i)=>same(p,b[i]));
 let total=0,officialLength=0,previous=null;const cleanSegments=[];
 for(let i=0;i<route.segments.length;i++){
  if(Date.now()>deadline)return {error:'REFERENCE_VALIDATION_LIMIT'};
  const s=route.segments[i],coords=s?.coordinates;if(!Array.isArray(coords)||coords.length<2||coords.some(p=>!valid(p))||(previous&&metres(previous,coords[0])>.000001))return invalid();
  let expected=null,length=0,roadCheck=road;
  if(s.kind==='official-line'){
   roadCheck=sourceRoad;
   let t0=s.sourceStartT,t1=s.sourceEndT;if(s.direction==='reverse')[t0,t1]=[t1,t0];
   const a=official(s.qgsFid,s.partIndex,s.segmentIndex,t0),b=official(s.qgsFid,s.partIndex,s.segmentIndex,t1);if(!a||!b)return invalid();
   expected=[a.point,b.point];length=metres(...expected);
   if(s.grade!=='unknown'||s.barrier!=='unknown'||s.width!=='unknown'||s.slope!=='unknown'||s.officialAreaCovered!==area(a.a,a.b))return invalid();
  }else if(s.kind==='source-join'){
   const from=part(s.from?.qgsFid,s.from?.partIndex),to=part(s.to?.qgsFid,s.to?.partIndex),a=vertex(from,s.from?.vertexIndex),b=vertex(to,s.to?.vertexIndex);
   const fromEnd=from&&(s.from.vertexIndex===0||s.from.vertexIndex===from.coordinates.length-1),toEnd=to&&(s.to.vertexIndex===0||s.to.vertexIndex===to.coordinates.length-1);
   if(!a||!b||(!fromEnd&&!toEnd)||`${s.from.qgsFid}:${s.from.partIndex}`===`${s.to.qgsFid}:${s.to.partIndex}`||s.topology!=='unconfirmed'||s.grade!=='unknown'||s.barrier!=='unknown')return invalid();
   expected=s.direction==='reverse'?[b,a]:[a,b];length=metres(a,b);if(length>2+1e-7||Math.abs(s.gapMetres-length)>.02)return invalid();
  }else if(s.kind==='osm-join'){
   const a=vertex(part(s.qgsFid,s.partIndex),s.vertexIndex),o=osm(s.osmEdgeId),j=s.osmSegmentIndex,t=s.osmSegmentT;
   if(!a||!o||!Number.isSafeInteger(j)||j<0||j>=o.line.length-1||!Number.isFinite(t)||t<0||t>1||s.topology!=='unconfirmed'||s.grade!=='unknown'||s.barrier!=='unknown')return invalid();
   const b=interpolate(o.line[j],o.line[j+1],t);expected=s.direction==='reverse'?[b,a]:[a,b];length=metres(a,b);
   if(length>2+1e-7||Math.abs(s.gapMetres-length)>.02)return invalid();
  }else if(s.kind==='osm'){
   const o=osm(s.edgeId);if(!o||!Number.isFinite(o.total)||o.total<=0)return invalid();
   expected=subline(o,s.startOffsetMetres,s.endOffsetMetres);if(!expected)return invalid();if(s.direction==='reverse')expected.reverse();
   length=o.e[2]*(s.endOffsetMetres-s.startOffsetMetres)/o.total;roadCheck=null;
   if(s.explicitSidewalk!==(o.w.highway==='footway'&&o.w.footway==='sidewalk')||s.sharedRoad!==(o.w.source==='osm-shared-street')||s.unknownDimensions!==(o.w.width==null||o.w.slope==null)||s.officialAreaCovered!==(o.e[5].coverage>=.9999&&o.e[5].maxUncoveredMetres<=.05))return invalid();
  }else if(s.kind==='endpoint-approach'){
   if((s.side==='start'&&i!==0)||(s.side==='end'&&i!==route.segments.length-1)||!['start','end'].includes(s.side)||s.access!=='unconfirmed'||s.grade!=='unknown')return invalid();
   let point;
   if(s.osmEdgeId!==undefined){
    if(s.qgsFid!==undefined||s.sourceT!==undefined)return invalid();
    const o=osm(s.osmEdgeId),j=s.osmSegmentIndex,t=s.osmSegmentT;
    if(!o||!Number.isSafeInteger(j)||j<0||j>=o.line.length-1||!Number.isFinite(t)||t<0||t>1)return invalid();
    point=interpolate(o.line[j],o.line[j+1],t);
   }else {const projection=official(s.qgsFid,s.partIndex,s.segmentIndex,s.sourceT);if(!projection)return invalid();point=projection.point;}
   expected=s.side==='start'?[start,point]:[point,end];length=metres(...expected);if(length>50+1e-7)return invalid();
   // An exact original graph node has no intervening road crossing; interior
   // projections and every nonzero connector still check the road geometry.
   if(s.osmEdgeId!==undefined&&length<=.000001){const o=osm(s.osmEdgeId);if(metres(point,o.line[0])<=.000001||metres(point,o.line.at(-1))<=.000001)roadCheck=null;}
  }else return invalid();
  if(!lineEqual(coords,expected)||!Number.isFinite(s.distanceMetres)||Math.abs(s.distanceMetres-length)>Math.max(.05,length*.0001)||(previous&&metres(previous,expected[0])>.000001)||!checkLine(expected,roadCheck))return invalid();
  const clean={kind:s.kind,coordinates:expected.map(p=>[...p]),distanceMetres:length};
  for(const k of ['qgsFid','partIndex','segmentIndex','sourceStartT','sourceEndT','direction','vertexIndex','osmEdgeId','osmSegmentIndex','osmSegmentT','edgeId','startOffsetMetres','endOffsetMetres','side','sourceT'])if(s[k]!==undefined)clean[k]=s[k];
  if(s.kind==='source-join'){clean.from={qgsFid:s.from.qgsFid,partIndex:s.from.partIndex,vertexIndex:s.from.vertexIndex};clean.to={qgsFid:s.to.qgsFid,partIndex:s.to.partIndex,vertexIndex:s.to.vertexIndex};}
  if(s.kind.endsWith('join')){clean.topology='unconfirmed';clean.gapMetres=length;}
  if(s.kind==='official-line'){const crossing=sourceRoad.inspect(expected[0],expected.at(-1));if(!crossing.allowed)return invalid();clean.crossing=crossing.crossing;clean.approximateCrossing=crossing.approximateCrossing;clean.officialAreaCovered=area(expected[0],expected.at(-1));clean.width='unknown';clean.slope='unknown';}
  if(s.kind==='osm'){const o=osm(s.edgeId);clean.roadName=typeof o.w.name==='string'&&o.w.name.length<=200?o.w.name:'人行路段';clean.crossing=o.w.crossing===true||o.w.footway==='crossing';clean.explicitSidewalk=o.w.highway==='footway'&&o.w.footway==='sidewalk';clean.sharedRoad=o.w.source==='osm-shared-street';clean.unknownDimensions=o.w.width==null||o.w.slope==null;clean.officialAreaCovered=o.e[5].coverage>=.9999&&o.e[5].maxUncoveredMetres<=.05;}
  if(s.kind!=='osm'){clean.grade='unknown';clean.barrier='unknown';}if(s.kind==='endpoint-approach')clean.access='unconfirmed';
  cleanSegments.push(clean);previous=expected.at(-1);total+=length;if(s.kind==='official-line')officialLength+=length;
 }
 if(officialLength<=.001||!same(route.segments[0].coordinates[0],start)||!same(previous,end)||Math.abs(route.distanceMetres-total)>Math.max(.1,total*.0001)||!constructionFresh(snapshot))return invalid();
 const coordinates=[];
 for(const segment of cleanSegments){
  for(const p of segment.coordinates)if(!coordinates.length||metres(coordinates.at(-1),p)>.000001)coordinates.push([...p]);
 }
 const steps=referenceNavigationSteps(cleanSegments);
 if(coordinates.length<2||!same(coordinates[0],start)||!same(coordinates.at(-1),end))return invalid();
 const construction=checker.inspect(coordinates);if(construction.blocked.length||!constructionFresh(snapshot))return invalid();
 const idx=graph.officialConditionIndex;let officialConditions={status:'unavailable',points:[]};if(idx){try{officialConditions={status:'available',points:idx.find(coordinates,10),fetchedAt:idx.fetchedAt,sourceObservedAt:idx.sourceObservedAt,source:idx.source};}catch{return invalid();}}
 return {kind:'official-passageway',source:'official-passageway',scope:'bounded-area',sourceHash,navigationAllowed:true,verification:'official-source-screened-v1',policyVersion:ROUTING_POLICY,coordinates,steps,officialConditions,segments:cleanSegments,distance:Math.round(total),distanceMetres:total,construction,constructionFetchedAt:snapshot.fetchedAt,constructionSourceUpdatedAt:snapshot.sourceUpdatedAt,unknownGrade:true,unknownBarriers:true,unknownRoadArea:true,unknownRoadSide:true,endpointAccess:'unconfirmed',preferenceCoverage:'limited',avoidPointsPolicy:avoid.length?'conservative-exclusion-25m':'none'};
}
