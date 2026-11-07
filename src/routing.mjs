import { roadConnectorChecker } from "./geometry.mjs";
import { officialGeometryEvidence } from "./supplemental-evidence.mjs";
import {edgeTier,edgeCostFactor,ROUTE_TIERS} from "./route-tiers.mjs";
export const ROUTING_POLICY = "pedestrian-evidence-v4";
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
  if (!["footway", "path", "pedestrian", "corridor"].includes(way.highway))
    return false;
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
  const mappedBridge = evidence.gradeSeparatedPedestrian === true && way.gradeSeparatedPedestrian === true && way.highway === 'footway' && way.bridge === 'yes' && (way.footway === 'sidewalk' || way.wheelchair === 'yes');
  if ((way.bridge && way.bridge !== 'no' && !mappedBridge) || (way.tunnel && way.tunnel !== 'no') ||
      (way.layer != null && !((mappedBridge?['0','1']:['0']).includes(String(way.layer)))) ||
      (way.level != null && !((mappedBridge?['0','1']:['0']).includes(String(way.level))))) return false;
  if (way.wheelchair === "no") return false;
  if (
    way.sidewalk === "no" &&
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
  if (options.avoidSteps !== false && way.highway === "steps") return false;
  if (way.width != null && way.width < (options.minWidth ?? 0.8)) return false;
  if (way.slope != null && Math.abs(way.slope) > (options.maxSlope ?? 8))
    return false;
  if (options.knownOnly && (way.width == null || way.slope == null))
    return false;
  return true;
}
export function createRouter(graph) {
  if (graph.officialPathEvidence?.schemaVersion !== 2)
    return () => ({ error: "UNVERIFIED_NETWORK" });
  const connectorRoadVerified =
    Array.isArray(graph.roadGeometries) &&
    Array.isArray(graph.officialCrossingAreas)
      ? roadConnectorChecker(graph.roadGeometries, graph.supplementalEvidence ? officialGeometryEvidence(graph).crossings : graph.officialCrossingAreas)
      : null;
  let heuristicScale=1;
  for(const e of graph.edges){const direct=metres(graph.nodes[e[0]],graph.nodes[e[1]]);if(direct>0)heuristicScale=Math.min(heuristicScale,e[2]/direct);}
  heuristicScale=Math.max(0,heuristicScale*.999);
  const adjacency = Array.from({ length: graph.nodes.length }, () => []);
  graph.edges.forEach((e, i) => {
    adjacency[e[0]].push([e[1], i]);
    adjacency[e[1]].push([e[0], i]);
  });
  // Project onto actual mapped ground-level segments, never create a free-space shortcut.
  const edgeGrid=new Map(),cellSize=.001,originalEdges=graph.edges.length,derived=new Map(),edgeProjections=new Map();
  function groundEdge(e,options){const w=graph.ways[e[3]];return edgeAllowed(w,options,e[5])&&(!w.bridge||w.bridge==='no')&&(w.layer==null||String(w.layer)==='0')&&(w.level==null||String(w.level)==='0');}
  function edgeGeometry(e){return [graph.nodes[e[0]].slice(0,2),...(e[4]||[]),graph.nodes[e[1]].slice(0,2)];}
  for(let ei=0;ei<originalEdges;ei++){
    const e=graph.edges[ei];if(!groundEdge(e,{minWidth:0,maxSlope:Infinity}))continue;
    const line=edgeGeometry(e),ys=line.map(p=>p[0]),xs=line.map(p=>p[1]);
    for(let y=Math.floor(Math.min(...ys)/cellSize);y<=Math.floor(Math.max(...ys)/cellSize);y++)for(let x=Math.floor(Math.min(...xs)/cellSize);x<=Math.floor(Math.max(...xs)/cellSize);x++){const k=x+','+y;if(!edgeGrid.has(k))edgeGrid.set(k,[]);edgeGrid.get(k).push(ei);}
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
      const key=f.ei+':'+f.p.map(v=>v.toFixed(10)).join(',');if(derived.has(key)||derived.size>=2048)continue;
      const e=graph.edges[f.ei],index=graph.nodes.length;graph.nodes.push([...f.p,0]);adjacency.push([]);derived.set(key,index);
      const previous=edgeProjections.get(f.ei)||[];
      const position={index,p:f.p,j:f.j,along:metres(f.line[f.j],f.p)};
      for(const prior of previous){
        let a=prior,b=position;if(a.j>b.j||(a.j===b.j&&a.along>b.along))[a,b]=[b,a];
        const line=[a.p,...f.line.slice(a.j+1,b.j+1),b.p],length=line.slice(1).reduce((n,p,i)=>n+metres(line[i],p),0);
        if(length>.001){const id=graph.edges.length;graph.edges.push([a.index,b.index,length,e[3],line.slice(1,-1),{...e[5],derivedFrom:f.ei}]);adjacency[a.index].push([b.index,id]);adjacency[b.index].push([a.index,id]);}
      }
      previous.push(position);edgeProjections.set(f.ei,previous);
      const left=[...f.line.slice(0,f.j+1),f.p],right=[f.p,...f.line.slice(f.j+1)];
      for(const [a,b,line]of [[e[0],index,left],[index,e[1],right]]){
        const length=line.slice(1).reduce((n,p,i)=>n+metres(line[i],p),0);if(length<.001)continue;
        const id=graph.edges.length;graph.edges.push([a,b,length,e[3],line.slice(1,-1),{...e[5],derivedFrom:f.ei}]);adjacency[a].push([b,id]);adjacency[b].push([a,id]);
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
    for (let i = 0; i < graph.nodes.length; i++) {
      const d = metres(point, graph.nodes[i]);
      if (d < nearestDist) nearestDist = d;
      if (d > SNAP_METRES) continue;
      const hasEdge = adjacency[i].length > 0;
      if(hasEdge && !graph.nodes[i][2] && adjacency[i].every(([,ei])=>graph.ways[graph.edges[ei][3]].gradeSeparatedPedestrian))continue;
      if (graph.nodes[i][2] || (hasEdge && !allowedAt(i, options))) {
        if (d < blockerDist) blockerDist = d;
      } else if (hasEdge) raw.push([d, i]);
    }
    raw.sort((a, b) => a[0] - b[0]);
    const chosen = [];
    for (const [d, i] of raw) {
      if (blockerDist <= d) break;
      if ((d <= 0.001 || approachClear(point, graph.nodes[i])) &&
          (!options.lineAllowed || options.lineAllowed([point,graph.nodes[i]])) &&
          (!options.approachAllowed || options.approachAllowed(point,graph.nodes[i],side))) {
        chosen.push({ index: i, distance: d });
        if (chosen.length === 48) break;
      }
    }
    return { chosen, nearestDist };
  }
  return function route(start, end, options = {}) {
    projectPoint(start,options,'start');projectPoint(end,options,'end');
    const starts=endpoints(start,options,'start'),ends=endpoints(end,options,'end');
    if(!starts.chosen.length||!ends.chosen.length)return {error:'NO_CONNECTION',startGap:starts.nearestDist,endGap:ends.nearestDist};
    if(metres(start,end)<.001)return {error:'SAME_POINT'};
    const targets=new Map(ends.chosen.map(p=>[p.index,p]));
    const workAllowed = new Map();
    const dist = new Float64Array(graph.nodes.length).fill(Infinity),
      prev = new Int32Array(graph.nodes.length).fill(-1),
      edgePrev = new Int32Array(graph.nodes.length).fill(-1);
    const heap = new MinHeap();
    for(const source of starts.chosen){const cost=source.distance*ROUTE_TIERS.connector.factor;dist[source.index]=cost;heap.push([cost+heuristicScale*metres(graph.nodes[source.index],end),source.index,cost]);}
    let bestTotal=Infinity,goal=-1;
    let found = false,
      visited = 0;
    while (heap.a.length) {
      const [lowerBound, u, cost] = heap.pop();
      if (cost !== dist[u]) continue;
      if(lowerBound>=bestTotal)break;
      if(targets.has(u)){
        const total=cost+targets.get(u).distance*ROUTE_TIERS.connector.factor;
        if(total<bestTotal){bestTotal=total;goal=u;found=true;}
      }
      visited++;
      for (const [v, ei] of adjacency[u]) {
        const e = graph.edges[ei],
          w = graph.ways[e[3]];
        if (graph.nodes[v][2] || !edgeAllowed(w, options, e[5])) continue;
        if (options.lineAllowed) {
          if (!workAllowed.has(ei))
            workAllowed.set(
              ei,
              options.lineAllowed([
                graph.nodes[e[0]],
                ...(e[4] || []),
                graph.nodes[e[1]],
              ]),
            );
          if (!workAllowed.get(ei)) continue;
        }
        let factor = edgeCostFactor(w,e[5],options);
        const mid = [
          (graph.nodes[u][0] + graph.nodes[v][0]) / 2,
          (graph.nodes[u][1] + graph.nodes[v][1]) / 2,
        ];
        if (options.avoidPoints?.some((p) => metres(mid, p) <= 25)) factor *= 8;
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
    if (!found) return { error: "NO_ROUTE", visited };
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
      crossings = 0,
      roadLength = 0,
      officialLength = 0,
      previousBearing = null;
    const steps = [];
    es.forEach((ei, k) => {
      const e = graph.edges[ei],
        w = graph.ways[e[3]];
      length += e[2];
      officialLength += e[2] * (e[5]?.coverage ?? 0);
      if (w.width == null || w.slope == null) unknown += e[2];
      if (w.crossing) crossings++;
      if (
        ![
          "footway",
          "path",
          "pedestrian",
          "living_street",
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
          unknown: w.width == null || w.slope == null,
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
    const tierSegments=[];
    es.forEach((ei,k)=>{
      const e=graph.edges[ei],tier=edgeTier(e[5]),middle=e[0]===path[k] ? e[4]||[] : [...(e[4]||[])].reverse();
      const coords=[graph.nodes[path[k]].slice(0,2),...middle,graph.nodes[path[k+1]].slice(0,2)],last=tierSegments.at(-1);
      if(last?.tier===tier){last.coordinates.push(...coords.slice(1));last.distance+=e[2];}else tierSegments.push({tier,coordinates:coords,distance:e[2]});
    });
    return {
      policyVersion: ROUTING_POLICY,
      weightedCost:bestTotal,
      tierSegments,
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
  };
}
