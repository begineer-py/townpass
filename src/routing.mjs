import { roadConnectorChecker } from "./geometry.mjs";
export const ROUTING_POLICY = "pedestrian-evidence-v3";
// Building entrances sit back from the mapped footway. 50m reaches a sidewalk;
// the approach is still rejected when it crosses a vehicle way outside a crossing.
export const SNAP_METRES = 80;
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
  if (
    (way.bridge && way.bridge !== "no") ||
    (way.tunnel && way.tunnel !== "no") ||
    (way.layer != null && String(way.layer) !== "0") ||
    (way.level != null && String(way.level) !== "0")
  )
    return false;
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
      ? roadConnectorChecker(graph.roadGeometries, graph.officialCrossingAreas)
      : null;
  const adjacency = Array.from({ length: graph.nodes.length }, () => []);
  graph.edges.forEach((e, i) => {
    adjacency[e[0]].push([e[1], i]);
    adjacency[e[1]].push([e[0], i]);
  });
  function allowedAt(index, options) {
    return adjacency[index].some(([, ei]) =>
      edgeAllowed(
        graph.ways[graph.edges[ei][3]],
        options,
        graph.edges[ei][5],
      ),
    );
  }
  const parent = new Int32Array(graph.nodes.length);
  for (let i = 0; i < parent.length; i++) parent[i] = i;
  function find(index) {
    let x = index;
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  graph.edges.forEach((e) => {
    if (graph.nodes[e[0]][2] || graph.nodes[e[1]][2]) return;
    if (!edgeAllowed(graph.ways[e[3]], {}, e[5])) return;
    const a = find(e[0]),
      b = find(e[1]);
    if (a !== b) parent[b] = a;
  });
  function approachClear(point, node) {
    const d = metres(point, node);
    if (d <= 0.001) return true;
    if (!connectorRoadVerified) return false;
    return connectorRoadVerified(point, node);
  }
  function endpoints(point, options) {
    let blockerDist = Infinity,
      nearestDist = Infinity;
    const raw = [];
    for (let i = 0; i < graph.nodes.length; i++) {
      const d = metres(point, graph.nodes[i]);
      if (d < nearestDist) nearestDist = d;
      if (d > SNAP_METRES) continue;
      const hasEdge = adjacency[i].length > 0;
      if (graph.nodes[i][2] || (hasEdge && !allowedAt(i, options))) {
        if (d < blockerDist) blockerDist = d;
      } else if (hasEdge) raw.push([d, i]);
    }
    raw.sort((a, b) => a[0] - b[0]);
    const chosen = [];
    for (const [d, i] of raw) {
      if (blockerDist <= d) break;
      if (d <= 0.001 || approachClear(point, graph.nodes[i])) {
        chosen.push({ index: i, distance: d });
        if (chosen.length === 16) break;
      }
    }
    return { chosen, nearestDist };
  }
  return function route(start, end, options = {}) {
    const starts = endpoints(start, options),
      ends = endpoints(end, options);
    let s = null,
      t = null,
      best = Infinity;
    for (const a of starts.chosen)
      for (const b of ends.chosen) {
        if (find(a.index) !== find(b.index)) continue;
        const score = a.distance + b.distance;
        if (score < best) {
          best = score;
          s = a;
          t = b;
        }
      }
    if (!s || !t)
      return {
        error:
          starts.chosen.length && ends.chosen.length
            ? "NO_ROUTE"
            : "NO_CONNECTION",
        startGap: starts.nearestDist,
        endGap: ends.nearestDist,
      };
    if (s.index === t.index) return { error: "SAME_POINT" };
    if (
      options.lineAllowed &&
      (!options.lineAllowed([start, graph.nodes[s.index]]) ||
        !options.lineAllowed([graph.nodes[t.index], end]))
    )
      return { error: "CONSTRUCTION_BLOCKED" };
    const workAllowed = new Map();
    const dist = new Float64Array(graph.nodes.length).fill(Infinity),
      prev = new Int32Array(graph.nodes.length).fill(-1),
      edgePrev = new Int32Array(graph.nodes.length).fill(-1);
    const heap = new MinHeap();
    dist[s.index] = 0;
    heap.push([0, s.index, 0]);
    let found = false,
      visited = 0;
    while (heap.a.length) {
      const [, u, cost] = heap.pop();
      if (cost !== dist[u]) continue;
      if (u === t.index) {
        found = true;
        break;
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
        let factor = 1;
        if (graph.officialPathEvidence && options.preferOfficial !== false)
          factor += 3 * (1 - (e[5]?.coverage ?? 0));
        if (
          [
            "primary",
            "secondary",
            "tertiary",
            "residential",
            "unclassified",
            "service",
          ].includes(w.highway)
        )
          factor += w.sidewalk === "no" ? 2.4 : 0.6;
        if (w.width == null || w.slope == null) factor += 0.12;
        if (
          [
            "gravel",
            "unpaved",
            "cobblestone",
            "ground",
            "sand",
            "dirt",
          ].includes(w.surface)
        )
          factor += options.mode === "gentle" ? 2 : 0.8;
        if (options.mode === "gentle" && w.slope != null)
          factor += Math.abs(w.slope) / 6;
        if (options.mode === "crossings" && w.crossing) factor += 3;
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
            next + metres(graph.nodes[v], graph.nodes[t.index]),
            v,
            next,
          ]);
        }
      }
    }
    if (!found) return { error: "NO_ROUTE", visited };
    const path = [],
      es = [];
    let v = t.index;
    while (v !== s.index) {
      path.push(v);
      es.push(edgePrev[v]);
      v = prev[v];
    }
    path.push(s.index);
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
    return {
      policyVersion: ROUTING_POLICY,
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
