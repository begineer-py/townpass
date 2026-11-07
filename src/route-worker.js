import { createRouter, metres } from "./routing.mjs";
import { gunzipSync } from "fflate";
import { validateNetwork } from "./network-contract.mjs";
import { createOfficialRouteVerifier } from './verify-official-route.mjs';
import {routeAroundConstruction,resolveVerifiedRoute} from './construction-routing.mjs';
import {createConstructionChecker} from './construction.mjs';
import {createDetourWaypoints} from './alternative-routes.mjs';
import {createLocalRouteVerifier,planPlaces,diagnoseConstruction} from './local-route-verifier.mjs';
import {createNearbyRoutes} from './nearby-routes.mjs';
let router, verifyOfficial, verifyLocal, facilities, initialization, detourWaypoints, nearbyRoutes, routeGraph;
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
    tierSegments:[...(a.tierSegments||[]),...(b.tierSegments||[])],
    approaches:[...(a.approaches||[]),...(b.approaches||[])],
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
      routeGraph=graph;
      const baseRouter=createRouter(graph);
      router=(a,b,options={})=>baseRouter(a,b,{...options,approachAllowed:(p,n,side)=>verifyLocal.approachAllowed(p,n,side==='start'?options.startPlace:options.endPlace,options,side)});
      verifyOfficial = createOfficialRouteVerifier(graph);
      const fr=await fetch(new URL('./facilities.json.gz',data.url));if(!fr.ok)throw Error('facilities');
      const fb=new Uint8Array(await fr.arrayBuffer());facilities=JSON.parse(new TextDecoder().decode(fb[0]===31&&fb[1]===139?gunzipSync(fb):fb));
      const pr=await fetch(new URL('./places.json.gz',data.url));if(!pr.ok)throw Error('places');
      const pb=new Uint8Array(await pr.arrayBuffer()),places=JSON.parse(new TextDecoder().decode(pb[0]===31&&pb[1]===139?gunzipSync(pb):pb));
      if(!Array.isArray(facilities)||!Array.isArray(places))throw Error('places');
      verifyLocal=createLocalRouteVerifier(graph,facilities,places);
      detourWaypoints=createDetourWaypoints(graph);
      })();
      await initialization;
      postMessage({ type: "ready" });
    } else if(data.type==='nearby-positions'){
      await initialization;
      let checker;try{checker=createConstructionChecker(data.construction);}catch{postMessage({type:'nearby-positions',id:data.id,result:{error:'CONSTRUCTION_UNAVAILABLE'}});return;}
      if(!nearbyRoutes)nearbyRoutes=createNearbyRoutes(routeGraph,{router,verifyLocal,facilities});
      const result=nearbyRoutes(data.startPlace,data.endPlace,data.options||{},data.construction,checker);
      postMessage({type:'nearby-positions',id:data.id,result});
    } else if(data.type==='plan-places'){
      await initialization;
      let checker;try{checker=createConstructionChecker(data.construction);}catch{postMessage({type:'route',id:data.id,result:{error:'CONSTRUCTION_UNAVAILABLE'}});return;}
      postMessage({type:'route',id:data.id,result:planPlaces(data.startPlace,data.endPlace,data.options,data.construction,{router,verifyLocal,facilities,checker})});
    } else if (data.type === 'verify-official') {
      await initialization;
      if (!verifyOfficial) throw Error('UNVERIFIED_NETWORK');
      if(!verifyLocal.endpointAllowed(data.start,data.options?.startPlace,'start')||!verifyLocal.endpointAllowed(data.end,data.options?.endPlace,'end')){
        postMessage({type:'verified-official',id:data.id,result:{error:'OFFICIAL_ENTRY_UNVERIFIED'}});return;
      }
      let result=resolveVerifiedRoute(data.route,data.start,data.end,data.options,data.construction,{router,verifyOfficial,verifyLocal});
      // Official polygon checks can establish coverage, not the user's actual
      // position or physical access to the network. Mark an explicit user
      // start connector as estimated even when covered by official polygons.
      const origin=data.options?.startPlace?.originKind,first=data.route?.coordinates?.[0];
      if(!result.error&&result.provider==='taipei-official'&&['gps','map'].includes(origin)&&first&&metres(data.start,first)>.05){
        result={...result,networkCoordinates:result.coordinates.slice(1),approaches:[...(result.approaches||[]),{side:'start',coordinates:[data.start,first],distance:Math.round(metres(data.start,first)),estimated:true,unconfirmed:true,entryStatus:'unconfirmed',originKind:origin}]};
      }
      if(result.error && ['OFFICIAL_PATH_UNVERIFIED','OFFICIAL_ROAD_CONFLICT','OFFICIAL_CROSSING_UNVERIFIED','OFFICIAL_ENTRY_UNVERIFIED','CONSTRUCTION_BLOCKED'].includes(result.error))result.detourWaypoints=detourWaypoints(data.start,data.end,result.detourCenter);
      postMessage({type:'verified-official',id:data.id,result});
    } else if (data.type === "route") {
      await initialization;
      if (!router) throw Error("not ready");
      let checker;try{checker=createConstructionChecker(data.construction);}catch{postMessage({type:'route',id:data.id,result:{error:'CONSTRUCTION_UNAVAILABLE'}});return;}
      function leg(start,end){
        const prefs={...data.options,lineAllowed:checker.allowed};
        const candidate=router(start,end,prefs);
        if(candidate.error){
          if(['NO_ROUTE','NO_CONNECTION'].includes(candidate.error))
            return diagnoseConstruction(start,end,prefs,data.construction,{router,verifyLocal,checker})||candidate;
          return candidate;
        }
        const checked=candidate.error?candidate:verifyLocal(candidate,start,end,data.options);
        return checked.error?checked:routeAroundConstruction({...checked,provider:'local-verified'},start,end,data.options,data.construction,{router,verifyOfficial,verifyLocal});
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
