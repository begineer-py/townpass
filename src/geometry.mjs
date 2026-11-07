// Check endpoint connectors against the exact polygon union. No buffers or sampling gaps.
const EPS = 1e-12;
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
function inRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j],
      b = ring[i],
      ab = sub(b, a),
      ap = sub(p, a);
    if (
      Math.abs(cross(ab, ap)) < EPS &&
      p[0] >= Math.min(a[0], b[0]) - EPS &&
      p[0] <= Math.max(a[0], b[0]) + EPS &&
      p[1] >= Math.min(a[1], b[1]) - EPS &&
      p[1] <= Math.max(a[1], b[1]) + EPS
    )
      return 0;
    if (
      a[1] > p[1] !== b[1] > p[1] &&
      p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside ? 1 : -1;
}
function contains(p, rings) {
  return (
    inRing(p, rings[0]) >= 0 && !rings.slice(1).some((r) => inRing(p, r) > 0)
  );
}
export function polygonConnectorChecker(geometries = []) {
  const polygons = [],
    grid = new Map(),
    size = 0.001;
  function add(g) {
    if (g.type === "GeometryCollection") {
      g.geometries.forEach(add);
      return;
    }
    const parts =
      g.type === "Polygon"
        ? [g.coordinates]
        : g.type === "MultiPolygon"
          ? g.coordinates
          : [];
    for (const rings of parts) {
      if (!rings[0]?.length) continue;
      const xs = rings[0].map((p) => p[0]),
        ys = rings[0].map((p) => p[1]);
      const box = [
          Math.min(...xs),
          Math.min(...ys),
          Math.max(...xs),
          Math.max(...ys),
        ],
        id = polygons.length;
      polygons.push({ rings, box });
      for (
        let x = Math.floor(box[0] / size);
        x <= Math.floor(box[2] / size);
        x++
      )
        for (
          let y = Math.floor(box[1] / size);
          y <= Math.floor(box[3] / size);
          y++
        ) {
          const key = `${x},${y}`;
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key).push(id);
        }
    }
  }
  geometries.forEach(add);
  return (from, to) => {
    const a = [from[1], from[0]],
      b = [to[1], to[0]],
      delta = sub(b, a),
      ids = new Set();
    for (
      let x = Math.floor(Math.min(a[0], b[0]) / size);
      x <= Math.floor(Math.max(a[0], b[0]) / size);
      x++
    )
      for (
        let y = Math.floor(Math.min(a[1], b[1]) / size);
        y <= Math.floor(Math.max(a[1], b[1]) / size);
        y++
      )
        for (const id of grid.get(`${x},${y}`) || []) ids.add(id);
    const candidates = [...ids].map((id) => polygons[id].rings),
      covered = (p) => candidates.some((r) => contains(p, r));
    if (!covered(a) || !covered(b)) return false;
    const ts = [0, 1];
    for (const rings of candidates)
      for (const ring of rings)
        for (let i = 1; i < ring.length; i++) {
          const c = ring[i - 1],
            d = ring[i],
            side = sub(d, c),
            ca = sub(c, a),
            den = cross(delta, side);
          if (Math.abs(den) > 1e-20) {
            const t = cross(ca, side) / den,
              u = cross(ca, delta) / den;
            if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
          } else if (Math.abs(cross(ca, delta)) < EPS) {
            const axis = Math.abs(delta[0]) > Math.abs(delta[1]) ? 0 : 1;
            if (Math.abs(delta[axis]) > 1e-15)
              for (const p of [c, d]) {
                const t = (p[axis] - a[axis]) / delta[axis];
                if (t > 0 && t < 1) ts.push(t);
              }
          }
        }
    ts.sort((x, y) => x - y);
    for (let i = 1; i < ts.length; i++) {
      const t = (ts[i - 1] + ts[i]) / 2;
      if (!covered([a[0] + delta[0] * t, a[1] + delta[1] * t])) return false;
    }
    return true;
  };
}

// A narrow boundary tolerance is available only to callers that explicitly
// request it. It identifies a mapped crossing near a road intersection; it
// does not prove that the route is physically traversable or in the same layer.
function crossingBoundaryChecker(geometries, toleranceMetres) {
  const size = 0.001, grid = new Map(), polygons = [];
  const latPad = toleranceMetres / 111000, lonPad = toleranceMetres / 100000;
  function add(g) {
    if (g.type === 'GeometryCollection') { g.geometries.forEach(add); return; }
    const parts = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    for (const rings of parts) {
      if (!rings[0]?.length) continue;
      const xs = rings[0].map(p=>p[0]), ys = rings[0].map(p=>p[1]);
      const box = [Math.min(...xs)-lonPad, Math.min(...ys)-latPad, Math.max(...xs)+lonPad, Math.max(...ys)+latPad], id=polygons.length;
      polygons.push({rings,box});
      for(let x=Math.floor(box[0]/size);x<=Math.floor(box[2]/size);x++) for(let y=Math.floor(box[1]/size);y<=Math.floor(box[3]/size);y++) {
        const k=`${x},${y}`;if(!grid.has(k))grid.set(k,[]);grid.get(k).push(id);
      }
    }
  }
  geometries.forEach(add);
  return ([lat,lon], roadStart, roadEnd) => {
    const p=[lon,lat],road=sub(roadEnd,roadStart),xscale=111195*Math.cos(lat*Math.PI/180),yscale=111195;
    const roadLength=Math.hypot(road[0]*xscale,road[1]*yscale);
    if(roadLength<.01)return false;
    for (const id of grid.get(`${Math.floor(lon/size)},${Math.floor(lat/size)}`)||[]) {
      const {rings,box}=polygons[id];
      if(lon<box[0]||lon>box[2]||lat<box[1]||lat>box[3]||rings.slice(1).some(r=>inRing(p,r)>=0))continue;
      const ring=rings[0];
      for(let i=1;i<ring.length;i++) {
        const c=ring[i-1],side=sub(ring[i],c),den=cross(road,side);
        if(Math.abs(den)<=1e-20)continue;
        const q=sub(c,roadStart),t=cross(q,side)/den,u=cross(q,road)/den;
        if(t<0||t>1||u<0||u>1)continue;
        const hit=[roadStart[0]+road[0]*t,roadStart[1]+road[1]*t];
        if(Math.hypot((hit[0]-lon)*xscale,(hit[1]-lat)*yscale)>toleranceMetres+1e-9)continue;
        // A mere tangent to another crossing is not evidence that the
        // mapped crossing actually includes this road segment.
        const epsilon=.005/roadLength;
        if([-epsilon,epsilon].some(dt=>{const x=t+dt;return x>=0&&x<=1&&contains([roadStart[0]+road[0]*x,roadStart[1]+road[1]*x],rings);}))return true;
      }
    }
    return false;
  };
}

export function roadConnectorChecker(lines = [], crossingAreas = [], {crossingToleranceMetres = 0} = {}) {
  if(!Number.isFinite(crossingToleranceMetres) || crossingToleranceMetres < 0 || crossingToleranceMetres > .25) throw new RangeError('INVALID_CROSSING_TOLERANCE');
  const crossingNearBoundary = crossingToleranceMetres ? crossingBoundaryChecker(crossingAreas, crossingToleranceMetres) : null;
  const crossingCovered = polygonConnectorChecker(crossingAreas),
    grid = new Map(),
    segments = [],
    size = 0.001;
  for (const line of lines)
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1],
        b = line[i],
        id = segments.length;
      segments.push([a, b]);
      for (
        let x = Math.floor(Math.min(a[0], b[0]) / size);
        x <= Math.floor(Math.max(a[0], b[0]) / size);
        x++
      )
        for (
          let y = Math.floor(Math.min(a[1], b[1]) / size);
          y <= Math.floor(Math.max(a[1], b[1]) / size);
          y++
        ) {
          const k = `${x},${y}`;
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(id);
        }
    }
  function inspectWithBoundary(from, to, nearBoundary) {
    let crossing=false,approximateCrossing=false;
    const rejected = () => ({allowed:false,crossing,approximateCrossing});
    const a = [from[1], from[0]],
      b = [to[1], to[0]],
      delta = sub(b, a),
      ids = new Set();
    for (
      let x = Math.floor(Math.min(a[0], b[0]) / size);
      x <= Math.floor(Math.max(a[0], b[0]) / size);
      x++
    )
      for (
        let y = Math.floor(Math.min(a[1], b[1]) / size);
        y <= Math.floor(Math.max(a[1], b[1]) / size);
        y++
      )
        for (const id of grid.get(`${x},${y}`) || []) ids.add(id);
    for (const id of ids) {
      const [c, d] = segments[id],
        side = sub(d, c),
        ca = sub(c, a),
        den = cross(delta, side);
      if (Math.abs(delta[0]) < 1e-15 && Math.abs(delta[1]) < 1e-15) {
        const onRoad = Math.abs(cross(sub(a, c), side)) < EPS &&
          a[0] >= Math.min(c[0], d[0]) - EPS && a[0] <= Math.max(c[0], d[0]) + EPS &&
          a[1] >= Math.min(c[1], d[1]) - EPS && a[1] <= Math.max(c[1], d[1]) + EPS;
        if (onRoad) { crossing=true; if (!crossingCovered(from, from)) return rejected(); }
        continue;
      }
      if (Math.abs(den) > 1e-20) {
        const t = cross(ca, side) / den,
          u = cross(ca, delta) / den;
        if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
          const hit = [a[1] + delta[1] * t, a[0] + delta[0] * t];
          crossing=true;
          if (!crossingCovered(hit, hit)) {
            if (!nearBoundary?.(hit,c,d)) return rejected();
            approximateCrossing=true;
          }
        }
      } else if (Math.abs(cross(ca, delta)) < EPS) {
        const axis = Math.abs(delta[0]) > Math.abs(delta[1]) ? 0 : 1;
        if (Math.abs(delta[axis]) < 1e-15) continue;
        const t1 = (c[axis] - a[axis]) / delta[axis],
          t2 = (d[axis] - a[axis]) / delta[axis],
          lo = Math.max(0, Math.min(t1, t2)),
          hi = Math.min(1, Math.max(t1, t2));
        if (
          lo <= hi &&
          !crossingCovered(
            [a[1] + delta[1] * lo, a[0] + delta[0] * lo],
            [a[1] + delta[1] * hi, a[0] + delta[0] * hi],
          )
        )
          return rejected();
        if (lo <= hi) crossing=true;
      }
    }
    return {allowed:true,crossing,approximateCrossing};
  }
  function checkerFor(nearBoundary) {
    const inspect=(from,to)=>inspectWithBoundary(from,to,nearBoundary);
    const check=(from,to)=>inspect(from,to).allowed;
    check.inspect=inspect;
    return check;
  }
  const check=checkerFor(crossingNearBoundary),variants=new Map();
  if(crossingToleranceMetres)variants.set(crossingToleranceMetres,check);
  check.withCrossingTolerance = tolerance => {
    if(!Number.isFinite(tolerance)||tolerance<0||tolerance>.25)throw new RangeError('INVALID_CROSSING_TOLERANCE');
    if(tolerance===0)return checkerFor(null);
    if(!variants.has(tolerance))variants.set(tolerance,checkerFor(crossingBoundaryChecker(crossingAreas,tolerance)));
    return variants.get(tolerance);
  };
  return check;
}
