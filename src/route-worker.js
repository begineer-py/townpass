import { metres } from "./routing.mjs";
import { gunzipSync } from "fflate";
import { validateNetwork } from "./network-contract.mjs";
import { createOfficialRouteVerifier } from './verify-official-route.mjs';
import {routeAroundConstruction,resolveVerifiedRoute} from './construction-routing.mjs';
import {createConstructionChecker,constructionFresh} from './construction.mjs';
import {createDetourWaypoints} from './alternative-routes.mjs';
import {createLocalRouteVerifier,diagnoseConstruction} from './local-route-verifier.mjs';
import {createNearbyRoutes} from './nearby-routes.mjs';
import {createVerifiedRouter,planImprovedPlaces} from './pedestrian-planning.mjs';
import {improvePedestrianRoute,measurePedestrianRoute} from './pedestrian-improvement.mjs';
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
      verifyOfficial = createOfficialRouteVerifier(graph);
      const fr=await fetch(new URL('./facilities.json.gz',data.url));if(!fr.ok)throw Error('facilities');
      const fb=new Uint8Array(await fr.arrayBuffer());facilities=JSON.parse(new TextDecoder().decode(fb[0]===31&&fb[1]===139?gunzipSync(fb):fb));
      const pr=await fetch(new URL('./places.json.gz',data.url));if(!pr.ok)throw Error('places');
      const pb=new Uint8Array(await pr.arrayBuffer()),places=JSON.parse(new TextDecoder().decode(pb[0]===31&&pb[1]===139?gunzipSync(pb):pb));
      if(!Array.isArray(facilities)||!Array.isArray(places))throw Error('places');
      verifyLocal=createLocalRouteVerifier(graph,facilities,places);
      router=createVerifiedRouter(graph,verifyLocal);
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
      let result=planImprovedPlaces(data.startPlace,data.endPlace,data.options||{},data.construction,{graph:routeGraph,router,verifyLocal,facilities,checker});
      if(result.error==='NO_ROUTE'&&result.failedPair){
        const {start:a,end:b}=result.failedPair,prefs={...data.options,startPlace:a,endPlace:b,lineAllowed:checker.allowed,diagnoseGap:true};
        const diagnostic=router([a.lat,a.lon],[b.lat,b.lon],prefs);
        result={...result,routeGap:diagnostic.error==='NO_ROUTE'?diagnostic.routeGap:{status:'unavailable'}};
      }
      if(result.failedPair){const {failedPair,...rest}=result;result=rest;}
      if(!constructionFresh(data.construction))result={error:'CONSTRUCTION_UNAVAILABLE'};
      postMessage({type:'route',id:data.id,result});
    } else if (data.type === 'verify-official') {
      await initialization;
      if (!verifyOfficial) throw Error('UNVERIFIED_NETWORK');
      if(!verifyLocal.endpointAllowed(data.start,data.options?.startPlace,'start')||!verifyLocal.endpointAllowed(data.end,data.options?.endPlace,'end')){
        postMessage({type:'verified-official',id:data.id,result:{error:'OFFICIAL_ENTRY_UNVERIFIED'}});return;
      }
      let result=resolveVerifiedRoute(data.route,data.start,data.end,data.options,data.construction,{router,verifyOfficial,verifyLocal});
      if(!result.error){let checker;try{checker=createConstructionChecker(data.construction);}catch{result={error:'CONSTRUCTION_UNAVAILABLE'};}
        if(checker)result=improvePedestrianRoute(result,data.start,data.end,data.options||{},data.construction,{graph:routeGraph,router,verifyLocal,checker});}
      // Official polygon checks can establish coverage, not the user's actual
      // position or physical access to the network. Mark an explicit user
      // start connector as estimated even when covered by official polygons.
      const origin=verifyLocal.userPointKind(data.start,data.options?.startPlace,'start'),destination=verifyLocal.userPointKind(data.end,data.options?.endPlace,'end'),first=data.route?.coordinates?.[0],last=data.route?.coordinates?.at(-1);
      if(!result.error&&result.provider==='taipei-official'){
        const approaches=[...(result.approaches||[])];
        if(['gps','map','selected'].includes(origin)&&first&&metres(data.start,first)>.05)
          approaches.push({side:'start',coordinates:[data.start,first],distance:Math.round(metres(data.start,first)),estimated:true,unconfirmed:true,entryStatus:'unconfirmed',originKind:origin});
        if(['map','selected'].includes(destination)&&last&&metres(data.end,last)>.05)
          approaches.push({side:'end',coordinates:[last,data.end],distance:Math.round(metres(data.end,last)),estimated:true,unconfirmed:true,entryStatus:'unconfirmed',originKind:destination});
        if(approaches.length)result={...result,networkCoordinates:data.route.coordinates,approaches};
      }
      if(!constructionFresh(data.construction))result={error:'CONSTRUCTION_UNAVAILABLE'};
      if(result.error && ['OFFICIAL_PATH_UNVERIFIED','OFFICIAL_ROAD_CONFLICT','OFFICIAL_CROSSING_UNVERIFIED','OFFICIAL_ENTRY_UNVERIFIED','CONSTRUCTION_BLOCKED'].includes(result.error))result.detourWaypoints=detourWaypoints(data.start,data.end,result.detourCenter);
      postMessage({type:'verified-official',id:data.id,result});
    } else if (data.type === "route") {
      await initialization;
      if (!router) throw Error("not ready");
      let checker;try{checker=createConstructionChecker(data.construction);}catch{postMessage({type:'route',id:data.id,result:{error:'CONSTRUCTION_UNAVAILABLE'}});return;}
      function leg(start,end,legOptions=data.options||{}){
        const prefs={...legOptions,lineAllowed:checker.allowed};
        const candidate=router(start,end,prefs);
        if(candidate.error){
          if(['NO_ROUTE','NO_CONNECTION'].includes(candidate.error)){
            const blocked=diagnoseConstruction(start,end,prefs,data.construction,{router,verifyLocal,checker});
            if(blocked)return blocked;
            if(candidate.error==='NO_ROUTE'){
              const diagnostic=router(start,end,{...prefs,diagnoseGap:true});
              return {...candidate,routeGap:diagnostic.error==='NO_ROUTE'?diagnostic.routeGap:{status:'unavailable'}};
            }
          }
          return candidate;
        }
        const checked=candidate.error?candidate:verifyLocal(candidate,start,end,legOptions);
        return checked.error?checked:routeAroundConstruction({...checked,provider:'local-verified'},start,end,legOptions,data.construction,{router,verifyOfficial,verifyLocal});
      }
      let result;
      if(data.via){
        let a=leg(data.start,data.via,{...data.options,endPlace:null}),b=a.error?a:leg(data.via,data.end,{...data.options,startPlace:null});
        if(!a.error&&!b.error){
          const ma=measurePedestrianRoute(routeGraph,a,data.start,data.via),mb=measurePedestrianRoute(routeGraph,b,data.via,data.end);
          if(ma&&mb){
            const total=ma.distance+mb.distance,limit=Math.min(total*1.3,total+300),deps={graph:routeGraph,router,verifyLocal,checker};
            a=improvePedestrianRoute(a,data.start,data.via,{...data.options,endPlace:null},data.construction,deps,{parentBaselineDistance:total,otherLegDistance:mb.distance,otherLegSidewalkMetres:mb.sidewalk});
            if(!a.error){const improvedA=measurePedestrianRoute(routeGraph,a,data.start,data.via);
              b=improvePedestrianRoute(b,data.via,data.end,{...data.options,startPlace:null},data.construction,deps,{parentBaselineDistance:total,otherLegDistance:improvedA.distance,otherLegSidewalkMetres:improvedA.sidewalk});}
            if(!a.error&&!b.error){const resultA=measurePedestrianRoute(routeGraph,a,data.start,data.via),resultB=measurePedestrianRoute(routeGraph,b,data.via,data.end);
              result=combineRoutes(a,b,data.viaName);result.pedestrianImprovement={status:'via-legs',originalDistanceMetres:total,maxDistanceMetres:limit,distanceMetres:resultA.distance+resultB.distance,legs:[a.pedestrianImprovement,b.pedestrianImprovement]};}
          }
        }
        if(!result)result=combineRoutes(a,b,data.viaName);
        if(!result.error)result={...result,provider:'local-verified',geometryVerification:a.geometryVerification,construction:checker.inspect(result.coordinates)};
      }else{
        result=leg(data.start,data.end);
        if(!result.error)result=improvePedestrianRoute(result,data.start,data.end,data.options||{},data.construction,{graph:routeGraph,router,verifyLocal,checker});
      }
      if(!constructionFresh(data.construction))result={error:'CONSTRUCTION_UNAVAILABLE'};
      postMessage({type:'route',id:data.id,result});
    }
  } catch (e) {
    postMessage({ type: "error", id: data.id, message: e.message });
  }
};
