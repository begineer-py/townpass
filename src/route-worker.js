import { createRouter } from "./routing.mjs";
import { gunzipSync } from "fflate";
import { validateNetwork } from "./network-contract.mjs";
import { createOfficialRouteVerifier } from './verify-official-route.mjs';
import {routeAroundConstruction,resolveVerifiedRoute} from './construction-routing.mjs';
import {createConstructionChecker} from './construction.mjs';
import {createDetourWaypoints} from './alternative-routes.mjs';
let router, verifyOfficial, initialization, detourWaypoints;
function combineRoutes(a, b, viaName) {
  if (a.error) return a;
  if (b.error) return b;
  const ad = a.distance,
    bd = b.distance,
    total = ad + bd;
  const mix = (pa, pb) =>
    total ? Math.round(((pa / 100) * ad + (pb / 100) * bd) / total * 100) : 0;
  return {
    policyVersion: a.policyVersion,
    coordinates: a.coordinates.concat(b.coordinates),
    distance: total,
    unknownPct: mix(a.unknownPct, b.unknownPct),
    officialCoveragePct:
      a.officialCoveragePct == null
        ? null
        : Math.floor(
            (((a.officialCoveragePct / 100) * ad +
              (b.officialCoveragePct / 100) * bd) /
              total) *
              100,
          ),
    officialEvidenceAt: a.officialEvidenceAt,
    roadPct: mix(a.roadPct, b.roadPct),
    crossings: a.crossings + b.crossings,
    steps: a.steps.concat(b.steps),
    startGap: a.startGap,
    endGap: b.endGap,
    viaName: viaName || "順路停靠",
  };
}
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      initialization = (async () => {
      const r = await fetch(data.url);
      if (!r.ok) throw Error("graph");
      const bytes = new Uint8Array(await r.arrayBuffer());
      const graph =
        bytes[0] === 31 && bytes[1] === 139
          ? JSON.parse(new TextDecoder().decode(gunzipSync(bytes)))
          : JSON.parse(new TextDecoder().decode(bytes));
      validateNetwork(graph);
      router = createRouter(graph);
      verifyOfficial = createOfficialRouteVerifier(graph);
      detourWaypoints=createDetourWaypoints(graph);
      })();
      await initialization;
      postMessage({ type: "ready" });
    } else if (data.type === 'verify-official') {
      await initialization;
      if (!verifyOfficial) throw Error('UNVERIFIED_NETWORK');
      const result=resolveVerifiedRoute(data.route,data.start,data.end,data.options,data.construction,{router,verifyOfficial});
      if(result.error && ['OFFICIAL_PATH_UNVERIFIED','OFFICIAL_ROAD_CONFLICT','OFFICIAL_CROSSING_UNVERIFIED','OFFICIAL_ENTRY_UNVERIFIED','CONSTRUCTION_BLOCKED'].includes(result.error))result.detourWaypoints=detourWaypoints(data.start,data.end,result.detourCenter);
      postMessage({type:'verified-official',id:data.id,result});
    } else if (data.type === "route") {
      await initialization;
      if (!router) throw Error("not ready");
      let checker;try{checker=createConstructionChecker(data.construction);}catch{postMessage({type:'route',id:data.id,result:{error:'CONSTRUCTION_UNAVAILABLE'}});return;}
      function leg(start,end){
        const candidate=router(start,end,{...data.options,lineAllowed:checker.allowed});
        const checked=candidate.error?candidate:verifyOfficial({...candidate,provider:'taipei-official',segmentPaths:[candidate.coordinates],crossingSegments:[]},start,end);
        return checked.error?checked:routeAroundConstruction({...checked,provider:'local-verified'},start,end,data.options,data.construction,{router,verifyOfficial});
      }
      let result;
      if(data.via){
        const a=leg(data.start,data.via),b=a.error?a:leg(data.via,data.end);
        result=combineRoutes(a,b,data.viaName);
        if(!result.error)result={...result,provider:'local-verified',geometryVerification:a.geometryVerification,construction:checker.inspect(result.coordinates)};
      }else result=leg(data.start,data.end);
      postMessage({type:'route',id:data.id,result});
    }
  } catch (e) {
    postMessage({ type: "error", id: data.id, message: e.message });
  }
};
