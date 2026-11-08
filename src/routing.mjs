import { eligibleSharedRoad } from "./shared-road-policy.mjs";
import { officialConditionCostFactor } from "./official-condition-cost.mjs";
import { diagnoseRouteGap } from "./route-gap.mjs";
import { roadConnectorChecker } from "./geometry.mjs";
import { officialGeometryEvidence } from "./supplemental-evidence.mjs";
import { crossingEvidence, crossingUncertainty } from "./crossing-evidence.mjs";
import {edgeTier,edgeCostFactor,edgeCostDetails,ROUTE_TIERS} from "./route-tiers.mjs";
import {generalSidewalkEdge} from './general-sidewalk.mjs';
export const ROUTING_POLICY = "pedestrian-evidence-v4";
// A Symbol cannot arrive through stored preferences or postMessage. It permits
// a diagnostic comparison route to identify stairs without ever enabling them
// in a user-facing route.
export const STEP_DIAGNOSTIC = Symbol("step-diagnostic");
// Building entrances sit back from the mapped footway. 50m reaches a sidewalk;
// the approach is still rejected when it crosses a vehicle way outside a crossing.
export const SNAP_METRES = 50;
export const metres = (a, b) =>
  Math.hypot((a[0] - b[0]) * 111195, (a[1] - b[1]) * 100700);
const bearing = (a, b) =>
  (Math.atan2((b[1] - a[1]) * Math.cos((a[0] * Math.PI) / 180), b[0] - a[0]) *
    180) /
  Math.PI;
export class MinHeap {
  a = [];
  push(item) {
    let i = this.a.length;
    this.a.push(item);
    while (i) {
      const p = (i - 1) >> 1;
      if (this.a[p][0] <= item[0]) break;
      this.a[i] = this.a[p];
      i = p;
    }
    this.a[i] = item;
  }
  pop() {
    const top = this.a[0],
      last = this.a.pop();
    if (this.a.length) {
      let i = 0;
      while (i * 2 + 1 < this.a.length) {
        let c = i * 2 + 1;
        if (c + 1 < this.a.length && this.a[c + 1][0] < this.a[c][0]) c++;
        if (this.a[c][0] >= last[0]) break;
        this.a[i] = this.a[c];
        i = c;
      }
      this.a[i] = last;
    }
    return top;
  }
}
export function edgeAllowed(way, options = {}, evidence = null) {
  // Safety constraints cannot be relaxed by UI options or old stored preferences.
  if (!way || ['no','private'].includes(way.access) || ['no','private'].includes(way.foot) || way.crossing === 'no') return false;
  const sharedRoad = eligibleSharedRoad(way, evidence);
  const diagnosticStep =
    way.highway === "steps" && options.stepDiagnostic === STEP_DIAGNOSTIC;
  if ((way.source === "osm-shared-street" || evidence?.sharedRoad === true) && !sharedRoad) return false;
  if (!sharedRoad && !diagnosticStep && !["footway", "path", "pedestrian", "corridor"].includes(way.highway))
    return false;
  if (sharedRoad && options.officialOnly) return false;
  if(way.isConnector && (way.source!=='official-polygon-connector' || evidence?.connectorVerified!==true || !Number.isFinite(evidence.connectorLength) || evidence.connectorLength<=0 || evidence.connectorLength>3 || evidence.coverage<.9999 || evidence.maxUncoveredMetres>.0001))return false;
  if (
    evidence?.schemaVersion !== 2 ||
    !Number.isFinite(evidence.coverage) ||
    evidence.coverage < 0 ||
    evidence.coverage > 1 ||
    !Number.isFinite(evidence.maxUncoveredMetres) ||
    evidence.maxUncoveredMetres < 0 ||
    evidence.roadCrossingVerified !== true
  )
    return false;
  if (
    !Number.isFinite(evidence.crossingCoverage) ||
    evidence.crossingCoverage < 0 ||
    evidence.crossingCoverage > 1
  )
    return false;
  if (
    (way.crossing || evidence.crossingCoverage > 0) &&
    evidence.crossingVerified !== true
  )
    return false;
  const audit=evidence?.gradeCrossingAudit;
  const mappedBridge = evidence.gradeSeparatedPedestrian === true && way.gradeSeparatedPedestrian === true && way.highway === 'footway' && way.bridge === 'yes' && (way.footway === 'sidewalk' || way.wheelchair === 'yes') && audit?.schemaVersion === 1 && audit.sourceVerified === true && Array.isArray(audit.conflicts) && audit.conflicts.length === 0;
  if ((way.bridge && way.bridge !== 'no' && !mappedBridge) || (way.tunnel && way.tunnel !== 'no') ||
      (way.layer != null && !((mappedBridge?['0','1']:['0']).includes(String(way.layer)))) ||
      (way.level != null && !((mappedBridge?['0','1']:['0']).includes(String(way.level))))) return false;
  if (way.wheelchair === "no") return false;
  if (
    !sharedRoad && way.sidewalk === "no" &&
    [
      "primary",
      "primary_link",
      "secondary",
      "secondary_link",
      "tertiary",
      "tertiary_link",
      "residential",
      "unclassified",
      "service",
    ].includes(way.highway)
  )
    return false;
  if (options.officialOnly && (evidence?.coverage ?? 0) < 0.95) return false;
  if (way.highway === "steps" && !diagnosticStep) return false;
  if (way.width != null && way.width < (options.minWidth ?? 0.8)) return false;
  if (way.slope != null && Math.abs(way.slope) > (options.maxSlope ?? 8))
    return false;
  if (options.knownOnly && (way.width == null || way.slope == null))
    return false;
  return true;
}
// One router owns each mutable graph and its projection IDs. A new router may
// be built when no projections exist, so updated source geometry is reindexed.
const graphRouters = new WeakMap();
const projectionArrayOwners = new WeakMap();
export function createRouter(graph, {useNodeIndex=true}={}) {
  if (graph.officialPathEvidence?.schemaVersion !== 2)
    return () => ({ error: "UNVERIFIED_NETWORK" });
  for(const array of [graph.nodes,graph.edges]){
    const owner=projectionArrayOwners.get(array);
    if(owner&&owner.graph!==graph&&owner.hasProjections())throw new Error('Cannot share graph arrays while derived projections exist');
  }
  const existing=graphRouters.get(graph);
  if(existing){
    if(existing.hasProjections())throw new Error('Cannot create another router while derived projections exist');
  }
  const routerGroup=existing?.group||{current:null};
  const connectorRoadVerified =
    Array.isArray(graph.roadGeometries) &&
    Array.isArray(graph.officialCrossingAreas)
      ? roadConnectorChecker(graph.roadGeometries, graph.supplementalEvidence ? officialGeometryEvidence(graph).crossings : graph.officialCrossingAreas)
      : null;
  let heuristicScale=1;
  for(const e of graph.edges){const direct=metres(graph.nodes[e[0]],graph.nodes[e[1]]);if(direct>0)heuristicScale=Math.min(heuristicScale,e[2]/direct);}
  heuristicScale=Math.max(0,heuristicScale*.999);
  const adjacency = Array.from({ length: graph.nodes.length }, () => []);
  const conditionCosts = new Map();
  let conditionIndex=graph.officialConditionIndex;
  function officialConditionPenalty(index,options={}) {
    if (options._ignoreOfficialConditions === true) return 0;
    if(conditionIndex!==graph.officialConditionIndex){conditionCosts.clear();conditionIndex=graph.officialConditionIndex;}
    if (!graph.officialConditionIndex) return 0;
    if (!conditionCosts.has(index)) {
      const edge=graph.edges[index], way=graph.ways[edge[3]];
      // Point-to-line proximity cannot prove which side of a road is affected.
      // Only apply a modest preference penalty to separately mapped pedestrian
      // geometry; never turn a nearby observation into a hard road closure.
      const pedestrian=['footway','path','pedestrian','corridor'].includes(way.highway);
      const line=[graph.nodes[edge[0]],...(edge[4]||[]),graph.nodes[edge[1]]];
      const points=pedestrian?graph.officialConditionIndex.find(line,2):[];
      conditionCosts.set(index,officialConditionCostFactor(line,points));
    }
    return conditionCosts.get(index);
  }
  graph.edges.forEach((e, i) => {
    adjacency[e[0]].push([e[1], i]);
    adjacency[e[1]].push([e[0], i]);
  });
  // Project onto actual mapped ground-level segments, never create a free-space shortcut.
  const edgeGrid=new Map(),unindexedEdges=[],unindexedNodeGrid=new Map(),cellSize=.001,originalEdges=graph.edges.length,originalNodes=graph.nodes.length,derived=new Map(),edgeProjections=new Map(),touchedNodes=new Set();
  const indexedNodes=new Uint8Array(originalNodes);
  const projectionLimit=2048,projectionEdgeLimit=16384,resetAt=1024;
  const newEpoch=()=>globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  const projectionState={baseEdges:originalEdges,baseNodes:originalNodes,epoch:newEpoch()};
  let derivedEdgeCount=0;
  const nodeArray=graph.nodes,edgeArray=graph.edges;
  const owner={graph,hasProjections:()=>derived.size>0};
  function claimProjectionArrays(){
    for(const array of [nodeArray,edgeArray]){
      const previous=projectionArrayOwners.get(array);
      if(previous&&previous!==owner&&previous.hasProjections())throw new Error('Cannot share graph arrays while derived projections exist');
    }
    projectionArrayOwners.set(nodeArray,owner);projectionArrayOwners.set(edgeArray,owner);
  }
  const graphIntact=()=>graph.nodes===nodeArray&&graph.edges===edgeArray&&graph.nodes.length===originalNodes+derived.size&&graph.edges.length===originalEdges+derivedEdgeCount;
  Object.defineProperty(graph,'_routeProjectionState',{value:projectionState,configurable:true});
  function addProjectionEdge(a,b,length,way,line,proof){
    const id=graph.edges.length;graph.edges.push([a,b,length,way,line,proof]);derivedEdgeCount++;adjacency[a].push([b,id]);adjacency[b].push([a,id]);
    if(a<originalNodes)touchedNodes.add(a);if(b<originalNodes)touchedNodes.add(b);
  }
  function projectionCapacityError(){const error=new Error('PROJECTION_LIMIT');error.code='PROJECTION_LIMIT';return error;}
  function groundEdge(e,options){const w=graph.ways[e[3]];return edgeAllowed(w,options,e[5])&&(!w.bridge||w.bridge==='no')&&(w.layer==null||String(w.layer)==='0')&&(w.level==null||String(w.level)==='0');}
  function edgeGeometry(e){return [graph.nodes[e[0]].slice(0,2),...(e[4]||[]),graph.nodes[e[1]].slice(0,2)];}
  for(let ei=0;ei<originalEdges;ei++){
    const e=graph.edges[ei];if(!groundEdge(e,{minWidth:0,maxSlope:Infinity})){unindexedEdges.push(ei);continue;}
    indexedNodes[e[0]]=1;indexedNodes[e[1]]=1;
    const line=edgeGeometry(e),ys=line.map(p=>p[0]),xs=line.map(p=>p[1]);
    for(let y=Math.floor(Math.min(...ys)/cellSize);y<=Math.floor(Math.max(...ys)/cellSize);y++)for(let x=Math.floor(Math.min(...xs)/cellSize);x<=Math.floor(Math.max(...xs)/cellSize);x++){const k=x+','+y;if(!edgeGrid.has(k))edgeGrid.set(k,[]);edgeGrid.get(k).push(ei);}
  }
  // Keep isolated, blocked and non-ground nodes in a small companion grid.
  // Indexed edge endpoints and their dynamic projections come from edgeGrid.
  for(let i=0;i<originalNodes;i++)if(!indexedNodes[i]){
    const p=graph.nodes[i],k=Math.floor(p[1]/cellSize)+','+Math.floor(p[0]/cellSize);
    if(!unindexedNodeGrid.has(k))unindexedNodeGrid.set(k,[]);unindexedNodeGrid.get(k).push(i);
  }
  function nearbyNodeIds(point,radius){
    if(!Array.isArray(point)||!Number.isFinite(point[0])||!Number.isFinite(point[1]))return null;
    const lat=radius/111195+1e-12,lon=radius/100700+1e-12,edges=new Set(),nodes=new Set();
    for(let y=Math.floor((point[0]-lat)/cellSize);y<=Math.floor((point[0]+lat)/cellSize);y++)
      for(let x=Math.floor((point[1]-lon)/cellSize);x<=Math.floor((point[1]+lon)/cellSize);x++){
        const k=x+','+y;for(const id of edgeGrid.get(k)||[])edges.add(id);
        for(const id of unindexedNodeGrid.get(k)||[])nodes.add(id);
      }
    for(const id of edges){const e=graph.edges[id];nodes.add(e[0]);nodes.add(e[1]);for(const projection of edgeProjections.get(id)||[])nodes.add(projection.index);}
    return [...nodes].sort((a,b)=>a-b);
  }
  // Read-only map-pick projections reuse the existing edge index; no graph
  // node or edge is created until the real route is independently verified.
  function mapSnapCandidates(point,options={},side='end',radius=30){
    if(!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite)||!Number.isFinite(radius)||radius<=0||radius>30)return [];
    const ids=new Set(),found=[],lat=radius/111195,lon=radius/100700;
    for(let y=Math.floor((point[0]-lat)/cellSize);y<=Math.floor((point[0]+lat)/cellSize);y++)for(let x=Math.floor((point[1]-lon)/cellSize);x<=Math.floor((point[1]+lon)/cellSize);x++)for(const ei of edgeGrid.get(x+','+y)||[])ids.add(ei);
    let checked=0;const checkBudget=()=>{if((++checked&127)===0&&Date.now()>options._mapSnapDeadline){const error=new Error('map snap limit');error.code='SNAP_LIMIT';throw error;}};
    for(const ei of ids){checkBudget();const e=graph.edges[ei],way=graph.ways[e?.[3]];
      if(!e||!way||!groundEdge(e,options)||graph.nodes[e[0]][2]||graph.nodes[e[1]][2]||way.source==='osm-shared-street'||e[5]?.sharedRoad===true||way.gradeSeparatedPedestrian||!['footway','path','pedestrian','corridor'].includes(way.highway))continue;
      const line=edgeGeometry(e);
      for(let j=0;j<line.length-1;j++){checkBudget();
        const a=line[j],b=line[j+1],dy=(b[0]-a[0])*111195,dx=(b[1]-a[1])*100700,t=Math.max(0,Math.min(1,((point[0]-a[0])*111195*dy+(point[1]-a[1])*100700*dx)/(dy*dy+dx*dx||1))),p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],distance=metres(point,p);
        if(distance>radius+1e-7||!approachClear(point,p)||options.lineAllowed&&!options.lineAllowed([point,p])||options.approachAllowed&&!options.approachAllowed(point,p,side))continue;
        const left=[...line.slice(0,j+1),p],right=[p,...line.slice(j+1)];
        if(options.lineAllowed && ![left,right].some(part=>part.length>=2&&metres(part[0],part.at(-1))>.001&&options.lineAllowed(part)))continue;
        found.push({point:p,distanceMetres:distance,edgeId:ei,source:'osm'});
      }
    }
    return found.sort((a,b)=>a.distanceMetres-b.distanceMetres||a.edgeId-b.edgeId);
  }
  function projectPoint(point,options,side){
    const ids=new Set(),found=[];
    for(let y=Math.floor((point[0]-.0005)/cellSize);y<=Math.floor((point[0]+.0005)/cellSize);y++)for(let x=Math.floor((point[1]-.0005)/cellSize);x<=Math.floor((point[1]+.0005)/cellSize);x++)for(const ei of edgeGrid.get(x+','+y)||[])ids.add(ei);
    for(const ei of ids){const e=graph.edges[ei];if(!groundEdge(e,options)||graph.nodes[e[0]][2]||graph.nodes[e[1]][2])continue;const line=edgeGeometry(e);let best;
      for(let j=0;j<line.length-1;j++){const a=line[j],b=line[j+1],dy=(b[0]-a[0])*111195,dx=(b[1]-a[1])*100700,t=Math.max(0,Math.min(1,((point[0]-a[0])*111195*dy+(point[1]-a[1])*100700*dx)/(dy*dy+dx*dx||1))),p=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],d=metres(point,p);if(!best||d<best.d)best={ei,j,p,d,line};}
      if(best&&best.d<=SNAP_METRES&&metres(best.p,line[0])>.01&&metres(best.p,line.at(-1))>.01)found.push(best);
    }
    found.sort((a,b)=>a.d-b.d);
    // Check the actual approach before limiting candidates: nearer segments may
    // be across a road, closed, or outside a verified entrance connection.
    let eligible=0;
    for(const f of found){
      if (!((f.d <= 0.001 || approachClear(point,f.p)) &&
          (!options.lineAllowed || options.lineAllowed([point,f.p])) &&
          (!options.approachAllowed || options.approachAllowed(point,f.p,side)))) continue;
      if (++eligible > 12) break;
      const key=f.ei+':'+f.p.map(v=>v.toFixed(10)).join(',');if(derived.has(key))continue;
      const previous=edgeProjections.get(f.ei)||[];
      if(derived.size>=projectionLimit || graph.edges.length-originalEdges+previous.length+2>projectionEdgeLimit)throw projectionCapacityError();
      claimProjectionArrays();
      const e=graph.edges[f.ei],index=graph.nodes.length;graph.nodes.push([...f.p,0]);adjacency.push([]);derived.set(key,index);
      const position={index,p:f.p,j:f.j,along:metres(f.line[f.j],f.p)};
      for(const prior of previous){
        let a=prior,b=position;if(a.j>b.j||(a.j===b.j&&a.along>b.along))[a,b]=[b,a];
        const line=[a.p,...f.line.slice(a.j+1,b.j+1),b.p],length=line.slice(1).reduce((n,p,i)=>n+metres(line[i],p),0);
        if(length>.001)addProjectionEdge(a.index,b.index,length,e[3],line.slice(1,-1),{...e[5],derivedFrom:f.ei});
      }
      previous.push(position);edgeProjections.set(f.ei,previous);
      const left=[...f.line.slice(0,f.j+1),f.p],right=[f.p,...f.line.slice(f.j+1)];
      for(const [a,b,line]of [[e[0],index,left],[index,e[1],right]]){
        const length=line.slice(1).reduce((n,p,i)=>n+metres(line[i],p),0);if(length<.001)continue;
        addProjectionEdge(a,b,length,e[3],line.slice(1,-1),{...e[5],derivedFrom:f.ei});
      }
    }
  }
  function allowedAt(index, options) {
    return adjacency[index].some(([, ei]) =>
      groundEdge(graph.edges[ei], options),
    );
  }
  function approachClear(point, node) {
    const d = metres(point, node);
    if (d <= 0.001) return true;
    if (!connectorRoadVerified) return false;
    return connectorRoadVerified(point, node);
  }
  function endpoints(point, options, side) {
    let blockerDist = Infinity,
      nearestDist = Infinity;
    const raw = [];
    const candidates=useNodeIndex?nearbyNodeIds(point,SNAP_METRES):null;
    for (let n=0;n<(candidates?.length??graph.nodes.length);n++) {
      const i=candidates?candidates[n]:n;
      const d = metres(point, graph.nodes[i]);
      if (d < nearestDist) nearestDist = d;
      if (d > SNAP_METRES) continue;
      const hasEdge = adjacency[i].length > 0;
      if(hasEdge && !graph.nodes[i][2] && adjacency[i].every(([,ei])=>graph.ways[graph.edges[ei][3]].gradeSeparatedPedestrian))continue;
      if (graph.nodes[i][2] || (hasEdge && !allowedAt(i, options))) {
        if (d < blockerDist) blockerDist = d;
      } else if (hasEdge) raw.push([d, i]);
    }
    // Preserve the exact nearest-gap diagnostic when no node lies within the
    // snap radius; normal successful routes avoid the citywide scan.
    if(candidates&&nearestDist>SNAP_METRES)for(const node of graph.nodes){const d=metres(point,node);if(d<nearestDist)nearestDist=d;}
    raw.sort((a, b) => a[0] - b[0]);
    const chosen = [];
    for (const [d, i] of raw) {
      if (blockerDist <= d) break;
      const forced=side==='start'?options._partialForceStartNode:options._partialForceEndNode;
      if(forced!=null && (i!==forced||d>.001))continue;
      if ((d <= 0.001 || approachClear(point, graph.nodes[i])) &&
          (!options.lineAllowed || options.lineAllowed([point,graph.nodes[i]])) &&
          (!options.approachAllowed || options.approachAllowed(point,graph.nodes[i],side))) {
        chosen.push({ index: i, distance: d });
        if (chosen.length === 48) break;
      }
    }
    return { chosen, nearestDist };
  }
  function route(start, end, options = {}) {
    if(!Array.isArray(start)||!Array.isArray(end)||start.length<2||end.length<2||![start[0],start[1],end[0],end[1]].every(Number.isFinite))return {error:'INVALID_POINTS'};
    if(routerGroup.current&&routerGroup.current!==route)return routerGroup.current(start,end,options);
    if(!graphIntact())return {error:'UNVERIFIED_NETWORK'};
    if(options._partialForceStartNode==null)projectPoint(start,options,'start');
    if(options._partialForceEndNode==null)projectPoint(end,options,'end');
    const starts=endpoints(start,options,'start'),ends=endpoints(end,options,'end');
    const workAllowed = new Map(),edgeFactors=new Map();
    function canTraverse(ei){
      if(workAllowed.has(ei))return workAllowed.get(ei);
      const e=graph.edges[ei],w=graph.ways[e[3]];
      const allowed=edgeAllowed(w,options,e[5])&&(!options.lineAllowed||options.lineAllowed([graph.nodes[e[0]],...(e[4]||[]),graph.nodes[e[1]]]));
      workAllowed.set(ei,allowed);return allowed;
    }
    function part(side,index){
      const point=graph.nodes[index].slice(0,2),boundary=side==='start'?'end':'start';
      const approachAllowed=(p,n,s)=>s===boundary?metres(p,n)<=.001:(!options.approachAllowed||options.approachAllowed(p,n,s));
      const prefs={...options,diagnosePartial:false,diagnoseGap:false,approachAllowed,
        _optimizeDeadline:Date.now()+2000,_optimizeMaxVisited:100000,
        ...(side==='start'?{_partialForceEndNode:index}:{_partialForceStartNode:index})};
      const result=side==='start'?route(start,point,prefs):route(point,end,prefs);
      return result.error||!result.edgeIds?.length?null:{side,point,route:result};
    }
    function nearestReachable(seeds,target){
      const seen=new Uint8Array(graph.nodes.length),queue=[];let best=-1,distance=Infinity,head=0;
      for(const p of seeds)if(!seen[p.index]){seen[p.index]=1;queue.push(p.index);}
      const deadline=Date.now()+1500;
      while(head<queue.length && head<100000 && ((head&255)!==0||Date.now()<=deadline)){
        const u=queue[head++],node=graph.nodes[u];
        if(!node[2]&&Number.isSafeInteger(node[3])&&adjacency[u].some(([v,ei])=>!graph.nodes[v][2]&&groundEdge(graph.edges[ei],options)&&canTraverse(ei))){const d=metres(node,target);if(d<distance){distance=d;best=u;}}
        for(const [v,ei] of adjacency[u])if(!seen[v]&&!graph.nodes[v][2]&&canTraverse(ei)){seen[v]=1;queue.push(v);}
      }
      return best;
    }
    if(!starts.chosen.length||!ends.chosen.length){
      const failed={error:'NO_CONNECTION',startGap:starts.nearestDist,endGap:ends.nearestDist};
      if(options.diagnosePartial && !!starts.chosen.length!==!!ends.chosen.length){
        const side=starts.chosen.length?'start':'end',index=nearestReachable(side==='start'?starts.chosen:ends.chosen,side==='start'?end:start);
        const segment=index<0?null:part(side,index);if(segment)failed.partialCandidates=[segment];
      }
      return failed;
    }
    if(metres(start,end)<.001)return {error:'SAME_POINT'};
    const targets=new Map(ends.chosen.map(p=>[p.index,p]));
    const dist = new Float64Array(graph.nodes.length).fill(Infinity),
      prev = new Int32Array(graph.nodes.length).fill(-1),
      edgePrev = new Int32Array(graph.nodes.length).fill(-1);
    const heap = new MinHeap();
    for(const source of starts.chosen){const cost=source.distance*ROUTE_TIERS.connector.factor;dist[source.index]=cost;heap.push([cost+heuristicScale*metres(graph.nodes[source.index],end),source.index,cost]);}
    let bestTotal=Infinity,goal=-1;
    const optimizeDeadline=Number.isFinite(options._optimizeDeadline)?options._optimizeDeadline:Infinity;
    const optimizeMaxVisited=Number.isInteger(options._optimizeMaxVisited)?options._optimizeMaxVisited:Infinity;
    let found = false,
      visited = 0;
    while (heap.a.length) {
      const [lowerBound, u, cost] = heap.pop();
      if (cost !== dist[u]) continue;
      if(lowerBound>=bestTotal)break;
      if(visited>=optimizeMaxVisited||((visited&255)===0&&Date.now()>optimizeDeadline))return {error:'OPTIMIZATION_BUDGET',visited};
      if(targets.has(u)){
        const total=cost+targets.get(u).distance*ROUTE_TIERS.connector.factor;
        if(total<bestTotal){bestTotal=total;goal=u;found=true;}
      }
      visited++;
      for (const [v, ei] of adjacency[u]) {
        const e = graph.edges[ei],
          w = graph.ways[e[3]];
        if (graph.nodes[v][2] || !canTraverse(ei)) continue;
        let factor=edgeFactors.get(ei);
        if(factor===undefined){
          factor=edgeCostFactor(w,e[5],options)+officialConditionPenalty(ei,options);
          if(w.source==='osm-shared-street'&&Number.isFinite(options._optimizeSharedPenalty))factor+=Math.max(0,Math.min(20,options._optimizeSharedPenalty));
          const sourceProof=e[5]?.derivedFrom!=null?graph.edges[e[5].derivedFrom]?.[5]:e[5];
          if(w.source!=='osm-shared-street'&&!generalSidewalkEdge(w,sourceProof)&&Number.isFinite(options._optimizeNonSidewalkPenalty))factor+=Math.max(0,Math.min(10,options._optimizeNonSidewalkPenalty));
          const mid=[(graph.nodes[e[0]][0]+graph.nodes[e[1]][0])/2,(graph.nodes[e[0]][1]+graph.nodes[e[1]][1])/2];
          if(options.avoidPoints?.some(p=>metres(mid,p)<=25))factor*=8;
          edgeFactors.set(ei,factor);
        }
        const next = cost + e[2] * factor;
        if (next < dist[v]) {
          dist[v] = next;
          prev[v] = u;
          edgePrev[v] = ei;
          heap.push([
            next+heuristicScale*metres(graph.nodes[v],end),
            v,
            next,
          ]);
        }
      }
    }
    if (!found) {
      const failed={error:'NO_ROUTE',visited};
      if(options.diagnoseGap||options.diagnosePartial){
        const gap=diagnoseRouteGap({graph,adjacency,forwardDist:dist,ends:ends.chosen,canTraverse,
          groundEdge:ei=>groundEdge(graph.edges[ei],options),...(options.diagnosePartial?{includeIndices:true,maxMetres:Infinity}:{})});
        const {startIndex,endIndex,...publicGap}=gap;failed.routeGap=publicGap;
        if(options.diagnosePartial){
          const indices=gap.status==='candidate'?[startIndex,endIndex]:[
            nearestReachable(starts.chosen,end),nearestReachable(ends.chosen,start)];
          const segments=[indices[0]>=0?part('start',indices[0]):null,indices[1]>=0?part('end',indices[1]):null].filter(Boolean);
          if(segments.length)failed.partialCandidates=segments;
        }
      }
      return failed;
    }
    const path = [],
      es = [];
    let v = goal;
    while (prev[v] !== -1) {
      path.push(v);
      es.push(edgePrev[v]);
      v = prev[v];
    }
    path.push(v);
    const s=starts.chosen.find(p=>p.index===v),t=targets.get(goal);
    path.reverse();
    es.reverse();
    let length = 0,
      unknown = 0,
      unknownWidth = 0,
      unknownSlope = 0,
      crossings = 0,
      roadLength = 0,
      officialLength = 0,
      previousBearing = null;
    const steps = [];
    // Costs are relative search preferences, not a safety score. Known hard
    // exclusions are still applied before a candidate reaches this point.
    const approachDistance=s.distance+t.distance;
    const costBreakdown={base:approachDistance,source:0,unknown:0,surface:0,width:0,slope:0,crossing:0,officialCondition:0,avoidPoint:0,entrance:approachDistance*(ROUTE_TIERS.connector.factor-1)};
    es.forEach((ei, k) => {
      const e = graph.edges[ei],
        w = graph.ways[e[3]];
      length += e[2];
      officialLength += e[2] * (e[5]?.coverage ?? 0);
      if (w.width == null || w.slope == null) unknown += e[2];
      if (w.width == null) unknownWidth += e[2];
      if (w.slope == null) unknownSlope += e[2];
      const detail=edgeCostDetails(w,e[5],options);
      const crossEvidence=crossingEvidence(w,e[5]);
      for(const key of ['base','source','unknown','surface','width','slope','crossing'])costBreakdown[key]+=detail[key]*e[2];
      costBreakdown.officialCondition+=officialConditionPenalty(ei,options)*e[2];
      const mid=[(graph.nodes[e[0]][0]+graph.nodes[e[1]][0])/2,(graph.nodes[e[0]][1]+graph.nodes[e[1]][1])/2];
      if(options.avoidPoints?.some(p=>metres(mid,p)<=25))costBreakdown.avoidPoint+=(edgeCostFactor(w,e[5],options)+officialConditionPenalty(ei,options))*7*e[2];
      if (w.crossing) crossings++;
      if (
        ![
          "footway",
          "path",
          "pedestrian",
          "corridor",
        ].includes(w.highway)
      )
        roadLength += e[2];
      const middle =
        e[0] === path[k] ? e[4] || [] : [...(e[4] || [])].reverse();
      const a = graph.nodes[path[k]],
        b = graph.nodes[path[k + 1]];
      const heading = bearing(a, middle[0] || b),
        delta =
          previousBearing == null
            ? 0
            : ((heading - previousBearing + 540) % 360) - 180;
      const turn =
        Math.abs(delta) > 150
          ? "迴轉"
          : delta > 35
            ? "右轉"
            : delta < -35
              ? "左轉"
              : "直行";
      const last = steps.at(-1);
      if (
        last &&
        last.name === w.name &&
        last.crossing === w.crossing &&
        last.crossingEvidence === crossEvidence &&
        last.unknown === (w.width == null || w.slope == null) &&
        last.roughSurface === (detail.surface > 0) &&
        last.sharedRoad === (w.source === "osm-shared-street") &&
        turn === "直行"
      )
        last.distance += e[2];
      else
        steps.push({
          way: e[3],
          name: w.name,
          turn,
          distance: e[2],
          lat: a[0],
          lon: a[1],
          crossing: w.crossing,
          crossingEvidence: crossEvidence,
          unknown: w.width == null || w.slope == null,
          roughSurface: detail.surface > 0,
          sharedRoad: w.source === "osm-shared-street",
          highway: w.highway,
        });
      previousBearing = bearing(middle.at(-1) || a, b);
    });
    const coordinates = [graph.nodes[path[0]].slice(0, 2)];
    es.forEach((ei, k) => {
      const e = graph.edges[ei],
        middle = e[4] || [];
      coordinates.push(
        ...(e[0] === path[k] ? middle : [...middle].reverse()),
        graph.nodes[path[k + 1]].slice(0, 2),
      );
    });
    const tierSegments=[],crossingUncertainties=[];
    es.forEach((ei,k)=>{
      const e=graph.edges[ei],tier=edgeTier(e[5]),middle=e[0]===path[k] ? e[4]||[] : [...(e[4]||[])].reverse();
      const way=graph.ways[e[3]],unknownWidth=way.width==null,unknownSlope=way.slope==null,roughSurface=edgeCostDetails(way,e[5],options).surface>0,sharedRoad=way.source==="osm-shared-street",crossEvidence=crossingEvidence(way,e[5]);
      const coords=[graph.nodes[path[k]].slice(0,2),...middle,graph.nodes[path[k+1]].slice(0,2)],last=tierSegments.at(-1);
      const uncertainty=crossingUncertainty(way,e[5],coords);if(uncertainty)crossingUncertainties.push(uncertainty);
      if(last?.tier===tier && last.unknownWidth===unknownWidth && last.unknownSlope===unknownSlope && last.roughSurface===roughSurface && last.sharedRoad===sharedRoad && last.crossingEvidence===crossEvidence){last.coordinates.push(...coords.slice(1));last.distance+=e[2];}else tierSegments.push({tier,unknownWidth,unknownSlope,roughSurface,sharedRoad,crossingEvidence:crossEvidence,coordinates:coords,distance:e[2]});
    });
    return {
      policyVersion: ROUTING_POLICY,
      projectionEpoch: projectionState.epoch,
      weightedCost:bestTotal,
      costBreakdown,
      unknownWidthMetres:unknownWidth,
      unknownSlopeMetres:unknownSlope,
      tierSegments,
      crossingUncertainties,
      edgeIds: es,
      nodeIds: path,
      coordinates,
      distance: Math.round(length),
      unknownPct: Math.round((unknown / length) * 100),
      officialCoveragePct: graph.officialPathEvidence
        ? Math.floor((officialLength / length) * 100)
        : null,
      officialEvidenceAt: graph.officialPathEvidence?.integratedAt ?? null,
      roadPct: Math.round((roadLength / length) * 100),
      crossings,
      steps,
      startGap: Math.round(s.distance),
      endGap: Math.round(t.distance),
      visited,
    };
  }
  // Called only at a worker task boundary, after every verifier and candidate
  // comparison using the preceding task's derived IDs has finished.
  // The projection grid covers eligible ground edges. Keep the excluded base
  // edges as well so reference selection has exactly the old full-scan set.
  route.referenceEdgeCandidates=bounds=>{
    if(routerGroup.current&&routerGroup.current!==route)return routerGroup.current.referenceEdgeCandidates(bounds);
    if(!graphIntact())throw new Error('Router graph was replaced');
    if(!Array.isArray(bounds)||bounds.length!==4||!bounds.every(Number.isFinite))return null;
    const [west,south,east,north]=bounds,x0=Math.floor(west/cellSize),x1=Math.floor(east/cellSize),y0=Math.floor(south/cellSize),y1=Math.floor(north/cellSize);
    if(x1<x0||y1<y0||(x1-x0+1)*(y1-y0+1)>30000)return null;
    const ids=new Set(unindexedEdges);
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)for(const id of edgeGrid.get(x+','+y)||[])ids.add(id);
    return [...ids].sort((a,b)=>a-b);
  };
  route.mapSnapCandidates=mapSnapCandidates;
  route.resetProjectionsIfNeeded=()=>{
    if(routerGroup.current&&routerGroup.current!==route)return routerGroup.current.resetProjectionsIfNeeded();
    if(!graphIntact())throw new Error('Router graph was replaced');
    if(derived.size<resetAt && graph.edges.length-originalEdges<projectionEdgeLimit/2)return false;
    for(const i of touchedNodes)adjacency[i]=adjacency[i].filter(([,edge])=>edge<originalEdges);
    touchedNodes.clear();adjacency.length=originalNodes;graph.nodes.length=originalNodes;graph.edges.length=originalEdges;derivedEdgeCount=0;
    derived.clear();edgeProjections.clear();
    for(const key of conditionCosts.keys())if(key>=originalEdges)conditionCosts.delete(key);
    projectionState.epoch=newEpoch();return true;
  };
  routerGroup.current=route;
  graphRouters.set(graph,{route,group:routerGroup,hasProjections:()=>derived.size>0});
  return route;
}
