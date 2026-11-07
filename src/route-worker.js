import { createRouter } from "./routing.mjs";
import { gunzipSync } from "fflate";
import { validateNetwork } from "./network-contract.mjs";
import { createOfficialRouteVerifier } from './verify-official-route.mjs';
import {routeAroundConstruction,resolveVerifiedRoute} from './construction-routing.mjs';
import {createConstructionChecker} from './construction.mjs';
import {createDetourWaypoints} from './alternative-routes.mjs';
import {createLocalRouteVerifier,planPlaces,diagnoseConstruction} from './local-route-verifier.mjs';
import {diagnoseAvoidedStairs} from './route-avoidance.mjs';
let router, verifyOfficial, verifyLocal, facilities, initialization, detourWaypoints;
function annotateAvoidance(result,start,end,prefs,checker){
  if(result?.error)return result;
  const avoidedStairs=diagnoseAvoidedStairs(router,start,end,prefs);
  let avoidedWorks=result.construction?.avoidedWorks||[];
  const {lineAllowed,...withoutClosures}=prefs;
  const direct=router(start,end,withoutClosures);
  if(!direct.error){
    const checked=verifyLocal(direct,start,end,withoutClosures);
    if(!checked.error){
      const found=checker.inspect(checked.coordinates).blocked;
      if(found.length)avoidedWorks=found;
    }
  }
  const construction=result.construction
    ? {...result.construction,avoided:avoidedWorks.length,avoidedWorks}
    : result.construction;
  return {...result,avoidedStairs,construction};
}
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
    avoidedStairs:[...(a.avoidedStairs||[]),...(b.avoidedStairs||[])],
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
      const baseRouter=createRouter(graph);
      router=(a,b,options={})=>baseRouter(a,b,{...options,approachAllowed:(p,n,side)=>verifyLocal.approachAllowed(p,n,side==='start'?options.startPlace:options.endPlace,options)});
      verifyOfficial = createOfficialRouteVerifier(graph);
      const fr=await fetch(new URL('./facilities.json.gz',data.url));if(!fr.ok)throw Error('facilities');
      const fb=new Uint8Array(await fr.arrayBuffer());facilities=JSON.parse(new TextDecoder().decode(fb[0]===31&&fb[1]===139?gunzipSync(fb):fb));
      verifyLocal=createLocalRouteVerifier(graph,facilities);
      detourWaypoints=createDetourWaypoints(graph);
      })();
      await initialization;
      postMessage({ type: "ready" });
    } else if(data.type==='plan-places'){
      await initialization;
      let checker;try{checker=createConstructionChecker(data.construction);}catch{postMessage({type:'route',id:data.id,result:{error:'CONSTRUCTION_UNAVAILABLE'}});return;}
      let result=planPlaces(data.startPlace,data.endPlace,data.options,data.construction,{router,verifyLocal,facilities,checker});
      if(!result.error){
        const start=[result.resolvedStart.lat,result.resolvedStart.lon],end=[result.resolvedEnd.lat,result.resolvedEnd.lon];
        result=annotateAvoidance(result,start,end,{...data.options,startPlace:result.resolvedStart,endPlace:result.resolvedEnd,lineAllowed:checker.allowed},checker);
      }
      postMessage({type:'route',id:data.id,result});
    } else if (data.type === 'verify-official') {
      await initialization;
      if (!verifyOfficial) throw Error('UNVERIFIED_NETWORK');
      let result=resolveVerifiedRoute(data.route,data.start,data.end,data.options,data.construction,{router,verifyOfficial,verifyLocal});
      let checker;try{checker=createConstructionChecker(data.construction);}catch{postMessage({type:'verified-official',id:data.id,result:{error:'CONSTRUCTION_UNAVAILABLE'}});return;}
      result=annotateAvoidance(result,data.start,data.end,{...data.options,lineAllowed:checker.allowed},checker);
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
        const result=checked.error?checked:routeAroundConstruction({...checked,provider:'local-verified'},start,end,data.options,data.construction,{router,verifyOfficial,verifyLocal});
        return annotateAvoidance(result,start,end,prefs,checker);
      }
      let result;
      if(data.via){
        const a=leg(data.start,data.via),b=a.error?a:leg(data.via,data.end);
        result=combineRoutes(a,b,data.viaName);
        if(!result.error){
          const work=checker.inspect(result.coordinates),avoidedWorks=[...(a.construction?.avoidedWorks||[]),...(b.construction?.avoidedWorks||[])];
          result={...result,provider:'local-verified',geometryVerification:a.geometryVerification,construction:{...work,avoided:avoidedWorks.length,avoidedWorks}};
        }
      }else result=leg(data.start,data.end);
      postMessage({type:'route',id:data.id,result});
    }
  } catch (e) {
    postMessage({ type: "error", id: data.id, message: e.message });
  }
};
