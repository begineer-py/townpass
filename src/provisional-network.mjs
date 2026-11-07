import {generalSidewalkSegment,generalPedestrianSegment} from './general-sidewalk.mjs';
import proj4 from 'proj4';
import {constructionFresh,createConstructionChecker} from './construction.mjs';
import {polygonConnectorChecker,roadConnectorChecker} from './geometry.mjs';
import {officialGeometryEvidence} from './supplemental-evidence.mjs';
import {edgeAllowed,metres,MinHeap} from './routing.mjs';
import {validateNetwork} from './network-contract.mjs';
import {createLocalRouteVerifier} from './local-route-verifier.mjs';
import {officialConditionMetrics,officialConditionScore} from './official-conditions.mjs';
import {officialConditionCostFactor} from './official-condition-cost.mjs';

// This separate candidate is never a verified route. Source endpoints do not
// contain a level or topological node identifier, even at exact coordinates.
const TWD97='+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs';
const CELL=.001,JOIN_METRES=2,ENDPOINT_METRES=50;
const valid=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=24.9&&p[0]<=25.3&&p[1]>=121.4&&p[1]<=121.8;
const key=(y,x)=>`${y},${x}`;
function project(p,a,b){const dy=(b[0]-a[0])*111195,dx=(b[1]-a[1])*100700,py=(p[0]-a[0])*111195,px=(p[1]-a[1])*100700,t=Math.max(0,Math.min(1,(py*dy+px*dx)/(dy*dy+dx*dx||1)));return {t,point:[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]};}
function gridInsert(grid,a,b,value,budget){const minY=Math.floor(Math.min(a[0],b[0])/CELL),maxY=Math.floor(Math.max(a[0],b[0])/CELL),minX=Math.floor(Math.min(a[1],b[1])/CELL),maxX=Math.floor(Math.max(a[1],b[1])/CELL),count=(maxY-minY+1)*(maxX-minX+1);if(count>4096||budget.entries+count>budget.maxEntries)return false;budget.entries+=count;for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){budget.check();const k=key(y,x);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(value);}return true;}
function gridNearby(grid,p,r,budget){const found=new Set(),lat=r/111195,lon=r/100700;for(let y=Math.floor((p[0]-lat)/CELL);y<=Math.floor((p[0]+lat)/CELL);y++)for(let x=Math.floor((p[1]-lon)/CELL);x<=Math.floor((p[1]+lon)/CELL);x++){budget.check();for(const item of grid.get(key(y,x))||[]){budget.check();found.add(item);}}return found;}
function error(code){return {error:code,kind:'provisional',navigationAllowed:false};}
function limitError(){const e=new Error('PROVISIONAL_SEARCH_LIMIT');e.code='PROVISIONAL_SEARCH_LIMIT';return e;}

// `parts` is a bounded, already-parsed set of original EPSG:3826 source parts:
// [{qgsFid,partIndex,coordinates:[[x,y],...]}]. `osmEdgeIds` is a bounded set
// from a spatial index, never user-supplied claims of verification. The full
// immutable source graph is read but never modified. The caller is responsible
// for selecting enough surrounding data; exhaustion is not proof of no route.
function createProvisionalNetworkInner({parts,sourceHash,graph,osmEdgeIds,snapshot,facilities,places,routingOptions={},limits={}}){
 let started=Date.now(),activeDeadline=Infinity;const maxMs=limits.maxMs??8000,maxParts=limits.maxParts??10000,maxEdges=limits.maxEdges??50000,maxVertices=limits.maxVertices??200000,maxVisits=limits.maxVisits??100000,maxPairs=limits.maxPairs??1000000,maxGridEntries=limits.maxGridEntries??1000000;
 if(![maxMs,maxParts,maxEdges,maxVertices,maxVisits,maxPairs,maxGridEntries].every(n=>Number.isFinite(n)&&n>0))return error('INVALID_PROVISIONAL_INPUT');
 const timedOut=()=>Date.now()-started>maxMs||Date.now()>activeDeadline;
 const budget={entries:0,maxEntries:maxGridEntries,ticks:0,check(){if((++this.ticks&127)===0&&timedOut())throw limitError();}};
 if(!constructionFresh(snapshot))return error('CONSTRUCTION_UNAVAILABLE');
 if(!Array.isArray(facilities)||!Array.isArray(places))return error('PROVISIONAL_ENDPOINT_DATA_UNAVAILABLE');
 if(!Array.isArray(parts)||parts.length>maxParts||!Array.isArray(osmEdgeIds)||osmEdgeIds.length>maxEdges||!/^[a-f0-9]{64}$/i.test(sourceHash||''))return error('INVALID_PROVISIONAL_INPUT');
 let vertexCount=0;for(const part of parts){budget.check();if(Array.isArray(part?.coordinates))vertexCount+=part.coordinates.length;if(vertexCount>maxVertices)return error('PROVISIONAL_SEARCH_LIMIT');}
 if(routingOptions.knownOnly)return error('NO_PROVISIONAL_CONNECTION');
 const staticEdgeCount=graph?._routeProjectionState?.baseEdges??graph?.edges?.length;
 try{validateNetwork(Number.isInteger(staticEdgeCount)&&staticEdgeCount<graph.edges.length?{...graph,edges:graph.edges.slice(0,staticEdgeCount)}:graph);}catch{return error('UNVERIFIED_NETWORK');}if(timedOut())return error('PROVISIONAL_SEARCH_LIMIT');
 let checker,evidence,endpointVerifier;try{checker=createConstructionChecker(snapshot);evidence=officialGeometryEvidence(graph);endpointVerifier=createLocalRouteVerifier(graph,facilities,places);}catch{return error('CONSTRUCTION_UNAVAILABLE');}
 const road=roadConnectorChecker(graph.roadGeometries,evidence.crossings),sourceRoad=road.withCrossingTolerance(.25),area=polygonConnectorChecker(evidence.areas),blocks=new Map(),avoidGrid=new Map(),nodes=[],adj=[],sourceSegments=[],endpoints=[],sourceVertices=[],osmGrid=new Map(),endGrid=new Map();if(timedOut())return error('PROVISIONAL_SEARCH_LIMIT');
 const conditionIndex=graph.officialConditionIndex;
 const conditionFactor=(line,eligible=true)=>conditionIndex&&eligible?officialConditionCostFactor(line,conditionIndex.find(line,2)):null;
 const avoidPoints=routingOptions.avoidPoints??[];if(!Array.isArray(avoidPoints)||avoidPoints.some(p=>!valid(p))||avoidPoints.length>10000)return error('INVALID_PROVISIONAL_INPUT');
 for(const p of avoidPoints)if(!gridInsert(avoidGrid,p,p,p,budget))return error('PROVISIONAL_SEARCH_LIMIT');
 for(const n of graph.nodes){budget.check();if(n[2]&&valid(n.slice(0,2))&&!gridInsert(blocks,n,n,n,budget))return error('PROVISIONAL_SEARCH_LIMIT');}
 function blocked(a,b){for(const n of gridNearby(blocks,[(a[0]+b[0])/2,(a[1]+b[1])/2],metres(a,b)/2+.5,budget))if(metres(n,project(n,a,b).point)<=.5)return true;return false;}
 // This is an explicit conservative avoidance preference, not a claim that
 // any point or the surrounding 25m is an actual closure.
 function avoided(a,b){for(const p of gridNearby(avoidGrid,[(a[0]+b[0])/2,(a[1]+b[1])/2],metres(a,b)/2+25,budget))if(metres(p,project(p,a,b).point)<=25)return true;return false;}
 function connector(a,b){return road(a,b)&&checker.allowed([a,b])&&!blocked(a,b)&&!avoided(a,b);}
 function node(p){nodes.push(p);adj.push([]);return nodes.length-1;}
 function edge(a,b,w,geometry,meta){adj[a].push({to:b,w,geometry,meta:{...meta,direction:'forward'}});adj[b].push({to:a,w,geometry:[...geometry].reverse(),meta:{...meta,direction:'reverse'}});}
 const osmNodes=new Map(),osmProjections=new Map();function osmNode(i){if(!osmNodes.has(i))osmNodes.set(i,node(graph.nodes[i].slice(0,2)));return osmNodes.get(i);}
 let operations=0;
 for(const id of new Set(osmEdgeIds)){
  if(timedOut())return error('PROVISIONAL_SEARCH_LIMIT');
  const e=graph.edges[id],w=e&&graph.ways[e[3]],a=e&&graph.nodes[e[0]],b=e&&graph.nodes[e[1]];
  if(!e||id>=staticEdgeCount||e[5]?.derivedFrom!=null||!a||!b||a[2]||b[2]||!edgeAllowed(w,routingOptions,e[5])||w.gradeSeparatedPedestrian||(w.bridge&&w.bridge!=='no')||(w.tunnel&&w.tunnel!=='no')||(w.layer!=null&&String(w.layer)!=='0')||(w.level!=null&&String(w.level)!=='0'))continue;
  const line=[a.slice(0,2),...(e[4]||[]),b.slice(0,2)];let usable=true;for(let j=0;j<line.length;j++){budget.check();if(!valid(line[j])||(j>0&&(!checker.allowed([line[j-1],line[j]])||blocked(line[j-1],line[j])||avoided(line[j-1],line[j])))){usable=false;break;}}if(!usable)continue;
  const offsets=[0];for(let j=1;j<line.length;j++){budget.check();offsets.push(offsets.at(-1)+metres(line[j-1],line[j]));}
  const aa=osmNode(e[0]),bb=osmNode(e[1]),meta={kind:'osm',edgeId:id,grade:'source-dependent',crossing:w.crossing===true||w.footway==='crossing',explicitSidewalk:w.highway==='footway'&&w.footway==='sidewalk',sharedRoad:w.source==='osm-shared-street',unknownDimensions:w.width==null||w.slope==null,officialAreaCovered:e[5].coverage>=.9999&&e[5].maxUncoveredMetres<=.05,officialConditionFactor:conditionFactor(line,w.source!=='osm-shared-street'),startOffsetMetres:0,endOffsetMetres:offsets.at(-1)};edge(aa,bb,e[2],line,meta);
  const record={id,e,line,aa,bb,meta,offsets,total:offsets.at(-1)};for(let j=1;j<line.length;j++)if(!gridInsert(osmGrid,line[j-1],line[j],{...record,j},budget))return error('PROVISIONAL_SEARCH_LIMIT');
 }
 const seen=new Set();
 for(const part of parts){
  if(timedOut())return error('PROVISIONAL_SEARCH_LIMIT');
  const fid=String(part?.qgsFid??''),index=part?.partIndex,raw=part?.coordinates,id=`${fid}:${index}`;
  if(!/^\d+$/.test(fid)||!Number.isSafeInteger(index)||index<0||seen.has(id)||!Array.isArray(raw)||raw.length<2)return error('INVALID_PROVISIONAL_INPUT');
  if((part.bridge&&part.bridge!=='no')||(part.tunnel&&part.tunnel!=='no')||(part.layer!=null&&String(part.layer)!=='0')||(part.level!=null&&String(part.level)!=='0')||part.blocked===true)continue;
  seen.add(id);const ll=[],ids=[];for(const p of raw){budget.check();if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||p[0]<100000||p[0]>400000||p[1]<2600000||p[1]>2900000)return error('INVALID_PROVISIONAL_INPUT');const [lon,lat]=proj4(TWD97,'EPSG:4326',p),point=[lat,lon];if(!valid(point))return error('INVALID_PROVISIONAL_INPUT');ll.push(point);ids.push(node(point));}
  for(let i=1;i<ll.length;i++){
   budget.check();const a=ll[i-1],b=ll[i],distance=metres(a,b);if(distance>1000)return error('PROVISIONAL_SEARCH_LIMIT');const crossing=sourceRoad.inspect(a,b);if(distance<.001||!crossing.allowed||!checker.allowed([a,b])||blocked(a,b)||avoided(a,b))continue;
   const meta={kind:'official-line',crossing:crossing.crossing,approximateCrossing:crossing.approximateCrossing,qgsFid:fid,partIndex:index,segmentIndex:i-1,sourceStartT:0,sourceEndT:1,grade:'unknown',barrier:'unknown',width:'unknown',slope:'unknown',officialAreaCovered:area(a,b),officialConditionFactor:conditionFactor([a,b])};
   edge(ids[i-1],ids[i],distance,[a,b],meta);sourceSegments.push({a,b,aa:ids[i-1],bb:ids[i],distance,meta});
  }
  for(let i=0;i<ll.length;i++){
   const vertex={point:ll[i],node:ids[i],part:id,fid,index,vertexIndex:i,isEndpoint:i===0||i===ll.length-1};
   sourceVertices.push(vertex);if(vertex.isEndpoint)endpoints.push(vertex);
  }
 }
 // Connect each source vertex to nearby endpoints of other source parts.
 // Source shape vertices are real source coordinates, but their grade and the
 // physical junction remain unconfirmed even when the coordinates coincide.
 const hasUsableSourceEdge=vertex=>adj[vertex.node].some(item=>item.meta.kind==='official-line');
 for(const endpoint of endpoints)if(hasUsableSourceEdge(endpoint)&&!gridInsert(endGrid,endpoint.point,endpoint.point,endpoint,budget))return error('PROVISIONAL_SEARCH_LIMIT');
 const joined=new Set();
 for(const endpoint of sourceVertices){
  if(!hasUsableSourceEdge(endpoint))continue;
  if(timedOut())return error('PROVISIONAL_SEARCH_LIMIT');
  for(const prior of gridNearby(endGrid,endpoint.point,JOIN_METRES,budget)){
   if(++operations>maxPairs)return error('PROVISIONAL_SEARCH_LIMIT');
   const d=metres(endpoint.point,prior.point),joinKey=endpoint.node<prior.node?`${endpoint.node}:${prior.node}`:`${prior.node}:${endpoint.node}`;
   if(endpoint.part===prior.part||joined.has(joinKey)||d>JOIN_METRES+1e-7||!connector(endpoint.point,prior.point))continue;
   joined.add(joinKey);
   edge(endpoint.node,prior.node,d,[endpoint.point,prior.point],{kind:'source-join',gapMetres:d,connectorCoordinates:[endpoint.point,prior.point],topology:'unconfirmed',grade:'unknown',barrier:'unknown',from:{qgsFid:endpoint.fid,partIndex:endpoint.index,vertexIndex:endpoint.vertexIndex},to:{qgsFid:prior.fid,partIndex:prior.index,vertexIndex:prior.vertexIndex}});
  }
  for(const item of gridNearby(osmGrid,endpoint.point,JOIN_METRES,budget)){
   if(++operations>maxPairs)return error('PROVISIONAL_SEARCH_LIMIT');
   const pr=project(endpoint.point,item.line[item.j-1],item.line[item.j]),gap=metres(endpoint.point,pr.point);
   if(gap>JOIN_METRES+1e-7||!connector(endpoint.point,pr.point))continue;
   const total=item.total;if(total<=0)continue;
   const along=item.offsets[item.j-1]+metres(item.line[item.j-1],pr.point);
   let projections=osmProjections.get(item.id);if(!projections){projections=[{node:item.aa,point:item.line[0],j:1,along:0},{node:item.bb,point:item.line.at(-1),j:item.line.length-1,along:total}];osmProjections.set(item.id,projections);}
   let position=projections.find(p=>Math.abs(p.along-along)<1e-7&&metres(p.point,pr.point)<.001);
   if(!position){
    position={node:node(pr.point),point:pr.point,j:item.j,along};let k=0;while(k<projections.length&&projections[k].along<along)k++;
    const previous=projections[k-1],next=projections[k];
    const connect=(left,right)=>{if(!left||!right)return;const geometry=[left.point,...item.line.slice(left.j,right.j),right.point],length=item.e[2]*(right.along-left.along)/total;if(length>.000001)edge(left.node,right.node,length,geometry,{...item.meta,partial:true,startOffsetMetres:left.along,endOffsetMetres:right.along});};
    connect(previous,position);connect(position,next);projections.splice(k,0,position);
   }
   const osmWay=graph.ways[item.e[3]],meta={kind:'osm-join',gapMetres:gap,connectorCoordinates:[endpoint.point,pr.point],topology:'unconfirmed',grade:'unknown',barrier:'unknown',qgsFid:endpoint.fid,partIndex:endpoint.index,vertexIndex:endpoint.vertexIndex,osmEdgeId:item.id,osmSegmentIndex:item.j-1,osmSegmentT:pr.t,explicitSidewalk:osmWay.highway==='footway'&&osmWay.footway==='sidewalk',sharedRoad:osmWay.source==='osm-shared-street',unknownDimensions:osmWay.width==null||osmWay.slope==null,officialAreaCovered:item.e[5].coverage>=.9999&&item.e[5].maxUncoveredMetres<=.05};
   edge(endpoint.node,position.node,gap,[endpoint.point,pr.point],{...meta,osmCoordinates:[],osmPartDistanceMetres:0});
  }
 }
 function findRouteInner(start,end,{startPlace,endPlace,profile={},deadline=Infinity,visitLimit=maxVisits,allowDistantOsm=false}={}){
 if(!allowDistantOsm)started=Date.now();activeDeadline=deadline;if(!constructionFresh(snapshot))return error('CONSTRUCTION_UNAVAILABLE');if(!valid(start)||!valid(end))return error('INVALID_PROVISIONAL_INPUT');
 if(!profile||typeof profile!=='object'||Array.isArray(profile)||Object.entries(profile).some(([k,v])=>!['area','sidewalk','shared','join','official'].includes(k)||!Number.isFinite(v)||v<0||v>10)||!(Number.isFinite(deadline)||deadline===Infinity)||!Number.isInteger(visitLimit)||visitLimit<1)return error('INVALID_PROVISIONAL_INPUT');
 if(conditionIndex!==graph.officialConditionIndex)return error('PROVISIONAL_DATA_CHANGED');
 const expired=()=>timedOut()||Date.now()>deadline;
 const cost=(meta,distance)=>{let extra=0;if(meta.kind==='official-line'||meta.kind==='osm'||meta.kind==='osm-join'){
   const roadDistance=meta.kind==='osm-join'?meta.osmPartDistanceMetres:distance;
   if(!generalSidewalkSegment(meta) && meta.kind!=='osm-join')extra+=((profile.area??0)+(profile.sidewalk??0))*roadDistance;
   if(Number.isFinite(meta.officialConditionFactor))extra+=(profile.official??0)*meta.officialConditionFactor*roadDistance;
   if(meta.kind==='osm'||meta.kind==='osm-join'){if(meta.kind==='osm-join' && !meta.sharedRoad && !meta.explicitSidewalk && !meta.officialAreaCovered)extra+=((profile.area??0)+(profile.sidewalk??0))*roadDistance;if(meta.sharedRoad)extra+=(profile.shared??0)*roadDistance;}
  }
  if(meta.kind==='source-join'||meta.kind==='osm-join')extra+=(profile.join??0)*(1+(meta.gapMetres||0));
  return distance+extra;};
 if(!endpointVerifier.endpointAllowed(start,startPlace,'start')||!endpointVerifier.endpointAllowed(end,endPlace,'end'))return error('OFFICIAL_ENTRY_UNVERIFIED');
 function seeds(point,side){
  const source=[];for(const s of sourceSegments){if(expired())return null;const pr=project(point,s.a,s.b),gap=metres(point,pr.point);if(gap>ENDPOINT_METRES||!connector(point,pr.point))continue;source.push({segment:s,pr,gap,side,source:true});}
  const osm=[];
  for(const item of gridNearby(osmGrid,point,ENDPOINT_METRES,budget)){
   if(expired())return null;
   const pr=project(point,item.line[item.j-1],item.line[item.j]),gap=metres(point,pr.point);
   // An exact original graph node has no connector to cross a road. Still
   // screen the point for construction and obstacles.
   const coincident=gap<=.000001&&(metres(pr.point,item.line[0])<=.000001||metres(pr.point,item.line.at(-1))<=.000001);
   const allowed=coincident?checker.allowed([point,pr.point])&&!blocked(point,pr.point)&&!avoided(point,pr.point):connector(point,pr.point);
   if(gap>ENDPOINT_METRES||!allowed||item.total<=0)continue;
   const along=item.offsets[item.j-1]+metres(item.line[item.j-1],pr.point);
   osm.push({item,pr,gap,side,along,source:false});
  }
  source.sort((a,b)=>a.gap-b.gap);osm.sort((a,b)=>a.gap-b.gap);
  // Prefer similarly short OSM approaches; never replace a direct source
  // connection with a long estimated shortcut merely because it is shorter.
  const limit=source.length&&!allowDistantOsm?source[0].gap+2:ENDPOINT_METRES;
  return [...source.slice(0,12),...osm.filter(s=>s.gap<=limit+1e-7).slice(0,12)];
 }
 function seedNeighbors(seed){
  if(seed.source){const s=seed.segment;return [[s.aa,s.distance*seed.pr.t],[s.bb,s.distance*(1-seed.pr.t)]].map(([id,distance])=>({id,distance}));}
  const item=seed.item,positions=osmProjections.get(item.id)||[{node:item.aa,point:item.line[0],along:0},{node:item.bb,point:item.line.at(-1),along:item.total}];
  let left=null,right=null;
  for(const p of positions){if(p.along<=seed.along+1e-7&&(!left||p.along>left.along))left=p;if(p.along>=seed.along-1e-7&&(!right||p.along<right.along))right=p;}
  return [...new Set([left,right].filter(Boolean))].map(p=>({id:p.node,distance:item.e[2]*Math.abs(p.along-seed.along)/item.total,position:p}));
 }
 function seedSegment(seed,neighbor,startSide){
  if(seed.source){const s=seed.segment,id=neighbor.id;return {coordinates:startSide?[seed.pr.point,nodes[id]]:[nodes[id],seed.pr.point],...s.meta,sourceStartT:startSide?seed.pr.t:(id===s.aa?0:1),sourceEndT:startSide?(id===s.aa?0:1):seed.pr.t,distanceMetres:neighbor.distance};}
  const item=seed.item,lo=Math.min(seed.along,neighbor.position.along),hi=Math.max(seed.along,neighbor.position.along),forward=startSide?seed.along<=neighbor.position.along:neighbor.position.along<=seed.along;
  const a=seed.along<=neighbor.position.along?seed.pr.point:neighbor.position.point,b=seed.along<=neighbor.position.along?neighbor.position.point:seed.pr.point;
  const geometry=[a,...item.line.slice(1,-1).filter((_,i)=>item.offsets[i+1]>lo+1e-7&&item.offsets[i+1]<hi-1e-7),b];
  return {...item.meta,partial:true,startOffsetMetres:lo,endOffsetMetres:hi,direction:forward?'forward':'reverse',coordinates:forward?geometry:geometry.reverse(),distanceMetres:neighbor.distance};
 }
 const starts=seeds(start,'start'),ends=seeds(end,'end');if(!starts||!ends)return error('PROVISIONAL_SEARCH_LIMIT');if(!starts.length||!ends.length)return error('NO_PROVISIONAL_CONNECTION');
 const dist=new Float64Array(nodes.length*2).fill(Infinity),previous=new Int32Array(nodes.length*2).fill(-1),previousEdge=new Array(nodes.length*2),roots=new Map(),targets=new Map(),heap=new MinHeap();
 for(const s of starts)for(const neighbor of seedNeighbors(s)){const state=neighbor.id*2+Number(s.source&&neighbor.distance>.001),meta=s.source?s.segment.meta:s.item.meta,w=s.gap+cost(meta,neighbor.distance);if(w<dist[state]){dist[state]=w;roots.set(state,{seed:s,neighbor});heap.push([w,state]);}}
 for(const s of ends)for(const neighbor of seedNeighbors(s)){const meta=s.source?s.segment.meta:s.item.meta,w=s.gap+cost(meta,neighbor.distance),entry={w,seed:s,neighbor};if(!targets.has(neighbor.id))targets.set(neighbor.id,[]);targets.get(neighbor.id).push(entry);}
 let best=Infinity,goal=-1,goalTarget=null,visited=0;while(heap.a.length){if(expired()||++visited>Math.min(maxVisits,visitLimit))return error('PROVISIONAL_SEARCH_LIMIT');const [d,state]=heap.pop();if(d!==dist[state])continue;if(d>=best)break;const u=Math.floor(state/2),touched=state%2===1;for(const target of targets.get(u)||[])if((touched||(target.seed.source&&target.neighbor.distance>.001))&&d+target.w<best){best=d+target.w;goal=state;goalTarget=target;}for(const item of adj[u]){budget.check();const next=item.to*2+Number(touched||item.meta.kind==='official-line'),nd=d+cost(item.meta,item.w);if(nd<dist[next]){dist[next]=nd;previous[next]=state;previousEdge[next]=item;heap.push([nd,next]);}}}
 // Two projections on the same source segment can connect directly without
 // travelling to one of its ends; both endpoint gaps remain unconfirmed.
 let direct=null;for(const a of starts)for(const b of ends)if(a.source&&b.source&&a.segment===b.segment){const length=a.gap+b.gap+cost(a.segment.meta,Math.abs(a.pr.t-b.pr.t)*a.segment.distance);if(length<best){best=length;direct={a,b};}}
 if(!Number.isFinite(best)){
  // A nearby official line may be disconnected; try longer, explicitly
  // unconfirmed OSM approaches only after the short-approach search fails.
  if(!allowDistantOsm&&!expired()&&visited<visitLimit)return findRouteInner(start,end,{startPlace,endPlace,profile,deadline,visitLimit:visitLimit-visited,allowDistantOsm:true});
  return error('NO_PROVISIONAL_ROUTE');
 }
 if(!constructionFresh(snapshot))return error('CONSTRUCTION_UNAVAILABLE');
 let first,last,segments=[];
 if(direct){first=direct.a;last=direct.b;segments.push({coordinates:[first.pr.point,last.pr.point],...first.segment.meta,sourceStartT:first.pr.t,sourceEndT:last.pr.t,distanceMetres:metres(first.pr.point,last.pr.point)});}
 else {let cursor=goal;while(previous[cursor]>=0){const item=previousEdge[cursor];segments.push({coordinates:item.geometry,...item.meta,distanceMetres:item.w});cursor=previous[cursor];}segments.reverse();const root=roots.get(cursor);first=root.seed;last=goalTarget.seed;segments.unshift(seedSegment(first,root.neighbor,true));segments.push(seedSegment(last,goalTarget.neighbor,false));}
 const approach=(seed,side,point)=>({kind:'endpoint-approach',side,coordinates:side==='start'?[point,seed.pr.point]:[seed.pr.point,point],distanceMetres:seed.gap,access:'unconfirmed',grade:'unknown',...(seed.source?{qgsFid:seed.segment.meta.qgsFid,partIndex:seed.segment.meta.partIndex,segmentIndex:seed.segment.meta.segmentIndex,sourceT:seed.pr.t}:{osmEdgeId:seed.item.id,osmSegmentIndex:seed.item.j-1,osmSegmentT:seed.pr.t})});
 segments.unshift(approach(first,'start',start));segments.push(approach(last,'end',end));
 for(const segment of segments)if(segment.kind==='official-line'){
  const crossing=sourceRoad.inspect(segment.coordinates[0],segment.coordinates.at(-1));
  if(!crossing.allowed)return error('PROVISIONAL_GEOMETRY_INVALID');
  segment.crossing=crossing.crossing;segment.approximateCrossing=crossing.approximateCrossing;
 }
 const coordinates=[],steps=[];let previousHeading=null;
 for(const segment of segments){
  if(!Array.isArray(segment.coordinates)||segment.coordinates.length<2||segment.coordinates.some(p=>!valid(p)))return error('PROVISIONAL_GEOMETRY_INVALID');
  if(coordinates.length&&metres(coordinates.at(-1),segment.coordinates[0])>.0001)return error('PROVISIONAL_GEOMETRY_INVALID');
  for(const p of segment.coordinates)if(!coordinates.length||metres(coordinates.at(-1),p)>.000001)coordinates.push(p);
  const lengths=segment.coordinates.slice(1).map((p,i)=>metres(segment.coordinates[i],p)),total=lengths.reduce((n,x)=>n+x,0);
  for(let i=0;i<lengths.length;i++){
   if(lengths[i]<.001)continue;const a=segment.coordinates[i],b=segment.coordinates[i+1],heading=(Math.atan2((b[1]-a[1])*100700,(b[0]-a[0])*111195)*180/Math.PI+360)%360,delta=previousHeading==null?0:((heading-previousHeading+540)%360)-180;
   const turn=Math.abs(delta)>150?'迴轉':delta>35?'右轉':delta< -35?'左轉':'直行';previousHeading=heading;
   const name=segment.kind==='official-line'?'官方通行線':segment.kind==='osm'?(graph.ways[graph.edges[segment.edgeId]?.[3]]?.name||'人行路段'):segment.kind==='endpoint-approach'?'起終點估算銜接':'路網接合處';
   steps.push({name,turn,lat:a[0],lon:a[1],distance:total?segment.distanceMetres*lengths[i]/total:0,kind:segment.kind,unknown:true,access:segment.kind==='endpoint-approach'||segment.kind.endsWith('join')?'unconfirmed':undefined,qgsFid:segment.qgsFid,partIndex:segment.partIndex,segmentIndex:segment.segmentIndex,edgeId:segment.edgeId,sharedRoad:segment.sharedRoad===true});
  }
 }
 if(coordinates.length<2||metres(coordinates[0],start)>.0001||metres(coordinates.at(-1),end)>.0001)return error('PROVISIONAL_GEOMETRY_INVALID');
 const construction=checker.inspect(coordinates);if(construction.blocked.length)return {error:'CONSTRUCTION_BLOCKED',kind:'provisional',navigationAllowed:false,construction};
 if(!constructionFresh(snapshot))return error('CONSTRUCTION_UNAVAILABLE');
 const officialConditions=conditionIndex?{status:'available',fetchedAt:conditionIndex.fetchedAt,sourceObservedAt:conditionIndex.sourceObservedAt,points:conditionIndex.find(coordinates,10)}:{status:'unavailable',points:[]};
 return {kind:'official-passageway',verification:'pending-source-validation',scope:'bounded-area',navigationAllowed:false,source:'official-passageway',sourceHash,constructionSourceUpdatedAt:snapshot.sourceUpdatedAt,construction,officialConditions,distanceMetres:segments.reduce((n,s)=>n+s.distanceMetres,0),searchCost:best,coordinates,steps,segments,unknownGrade:true,unknownBarriers:true,unknownRoadArea:true,unknownRoadSide:true,endpointAccess:'unconfirmed',avoidPointsPolicy:avoidPoints.length?'conservative-exclusion-25m':'none',preferenceCoverage:'limited',search:{visited,parts:parts.length,osmEdges:osmEdgeIds.length}};
 }
 function findRoute(...args){try{return findRouteInner(...args);}catch(e){if(e?.code==='PROVISIONAL_SEARCH_LIMIT')return error(e.code);throw e;}}
 // Scores are comparisons of the available data, not accessibility ratings.
 // Unknown dimensions/levels and estimated connectors must never count as a
 // known-clear segment. Each search remains on the same bounded graph.
 function metrics(route,shortest){
  let sidewalkMetres=0,sharedMetres=0,unknownMetres=0,approachMetres=0,joinCount=0;
  for(const s of route.segments){const d=s.distanceMetres||0;if(generalPedestrianSegment(s))sidewalkMetres+=d;if(s.sharedRoad===true&&s.kind==='osm')sharedMetres+=d;
   if(s.kind==='official-line'||s.kind==='source-join'||s.kind==='osm-join'||s.kind==='endpoint-approach'||s.unknownDimensions!==false)unknownMetres+=d;
   if(s.kind==='endpoint-approach')approachMetres+=d;if(s.kind==='source-join'||s.kind==='osm-join')joinCount++;
  }
 const total=route.distanceMetres||1,detour=Math.max(0,route.distanceMetres-shortest),condition=officialConditionMetrics(route.officialConditions),coverage={generalSidewalkMetres:sidewalkMetres,sharedMetres,unknownMetres,estimatedApproachMetres:approachMetres,unconfirmedJoinCount:joinCount,...condition};
  const scoreBreakdown={sidewalk:40*sidewalkMetres/total,shared:-25*sharedMetres/total,unknown:-12*unknownMetres/total,estimatedApproach:-15*approachMetres/total,joins:-Math.min(10,joinCount*2),detour:-20*detour/(shortest||1),officialConditions:officialConditionScore(condition.officialConditionWeight)};
  return {coverage,scoreBreakdown,score:100/(1+Math.exp(-Object.values(scoreBreakdown).reduce((a,b)=>a+b,0)/20))};
 }
 function findCandidates(start,end,{startPlace,endPlace,maxRounds=4,totalMs=2000,maxVisitedTotal=80000}={}){
  if(!Number.isInteger(maxRounds)||maxRounds<1||maxRounds>4||!Number.isFinite(totalMs)||totalMs<=0||totalMs>10000||!Number.isInteger(maxVisitedTotal)||maxVisitedTotal<1||maxVisitedTotal>400000)return error('INVALID_PROVISIONAL_INPUT');
  const deadline=Date.now()+totalMs,profiles=[{}, {area:2}, {sidewalk:2,shared:4}, {join:2,area:.5,official:3}],candidates=[],seen=new Set();let visited=0,status='complete',attempted=0;
  const signature=route=>route.coordinates.map(p=>`${p[0].toFixed(7)},${p[1].toFixed(7)}`).join(';');
  let shortest=null;
  for(let i=0;i<maxRounds;i++){
   if(Date.now()>deadline||visited>=maxVisitedTotal){status='incomplete';break;}
   attempted++;
   const route=findRoute(start,end,{startPlace,endPlace,profile:profiles[i],deadline,visitLimit:maxVisitedTotal-visited});
   if(route.error){if(route.error==='CONSTRUCTION_UNAVAILABLE')return route;if(i===0)return route;status='incomplete';break;}
   visited+=route.search.visited;if(shortest===null)shortest=route.distanceMetres;
   const limit=Math.min(shortest*1.3,shortest+300),sig=signature(route);
   if(route.distanceMetres>limit+1e-7||seen.has(sig))continue;
   seen.add(sig);candidates.push({id:i===0?'shortest':`candidate-${i}`,route,...metrics(route,shortest)});
  }
  if(!constructionFresh(snapshot))return error('CONSTRUCTION_UNAVAILABLE');
  if(!candidates.length)return error('PROVISIONAL_SEARCH_LIMIT');
  const ranked=[...candidates].sort((a,b)=>b.score-a.score||a.route.distanceMetres-b.route.distanceMetres||a.id.localeCompare(b.id));
  return {kind:'provisional-comparison',navigationAllowed:false,status,sourceHash,constructionSourceUpdatedAt:snapshot.sourceUpdatedAt,start,end,shortestDistanceMetres:shortest,maxDistanceMetres:Math.min(shortest*1.3,shortest+300),recommendedCandidateId:ranked[0].id,candidates,scoreMeaning:'comparison-only-not-accessibility',search:{attempted,visited,maxRounds,totalMs,maxVisitedTotal}};
 }
 return {kind:'provisional-network',navigationAllowed:false,sourceHash,findRoute,findCandidates};
}

export function createProvisionalNetwork(options){try{return createProvisionalNetworkInner(options);}catch(e){if(e?.code==='PROVISIONAL_SEARCH_LIMIT')return error(e.code);throw e;}}
export function findProvisionalRoute(options){const network=createProvisionalNetwork(options);return network.error?network:network.findRoute(options.start,options.end,{startPlace:options.startPlace,endPlace:options.endPlace});}
