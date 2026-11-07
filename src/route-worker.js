import { metres } from "./routing.mjs";
import {verifiedPartialRoute} from "./partial-route.mjs";
import { gunzipSync } from "fflate";
import {createOfficialConditionIndex} from './official-conditions.mjs';
import { validateNetwork } from "./network-contract.mjs";
import { createOfficialRouteVerifier } from './verify-official-route.mjs';
import {routeAroundConstruction,resolveVerifiedRoute} from './construction-routing.mjs';
import {createConstructionChecker,constructionFresh} from './construction.mjs';
import {createDetourWaypoints} from './alternative-routes.mjs';
import {createLocalRouteVerifier,diagnoseConstruction} from './local-route-verifier.mjs';
import {createNearbyRoutes} from './nearby-routes.mjs';
import {createVerifiedRouter,planImprovedPlaces} from './pedestrian-planning.mjs';
import {improvePedestrianRoute,measurePedestrianRoute} from './pedestrian-improvement.mjs';
import {findRouteCandidates} from './route-candidates.mjs';
import {compareOfficialAndLocal} from './cross-source-candidates.mjs';
let router, verifyOfficial, verifyLocal, facilities, initialization, detourWaypoints, nearbyRoutes, routeGraph;
function withCandidates(base,startPlace,endPlace,options,snapshot,checker){
  if(base?.error)return base;
  const a=base.resolvedStart||startPlace,b=base.resolvedEnd||endPlace;
  if(!Number.isFinite(a?.lat)||!Number.isFinite(a?.lon)||!Number.isFinite(b?.lat)||!Number.isFinite(b?.lon))
    return {...base,routeCandidates:{status:'missing-endpoints',candidates:[]}};
  const prefs={...options,startPlace:a,endPlace:b};
  const choices=findRouteCandidates(base,[a.lat,a.lon],[b.lat,b.lon],prefs,snapshot,{graph:routeGraph,router,verifyLocal,checker});
  if(choices.error)return choices.error==='CONSTRUCTION_UNAVAILABLE'?choices:{...base,routeCandidates:{status:choices.error,candidates:[]}};
  const selected=choices.candidates?.[0];
  return selected?{...selected.route,routeCandidates:choices,selectedCandidateId:selected.id}:{...base,routeCandidates:choices};
}
function combineRoutes(a, b, viaName) {
  if (a.error) return a;
  if (b.error) return b;
  const ad = a.distance,
    bd = b.distance,
    total = ad + bd;
  const mix = (pa, pb) =>
    total ? Math.round(((pa / 100) * ad + (pb / 100) * bd) / total * 100) : 0;
  const available=a.officialConditions?.status==='available'&&b.officialConditions?.status==='available';
  const points=available?[...new Map([...a.officialConditions.points,...b.officialConditions.points].map(p=>[`${p.type}:${p.id}`,p])).values()]:[];
  return {
    policyVersion: a.policyVersion,
    coordinates: a.coordinates.concat(b.coordinates),
    distance: total,
    tierSegments:[...(a.tierSegments||[]),...(b.tierSegments||[])],
    approaches:[...(a.approaches||[]),...(b.approaches||[])],
    officialConditions:available?{...a.officialConditions,points}:{status:'unavailable',points:[]},
    crossingUncertainties:[...(a.crossingUncertainties||[]),...(b.crossingUncertainties||[])],
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
      // Data is optional for routing, but unavailable must not be presented as
      // zero conditions. Never use stale hard-coded observations as current.
      try{
        const hr=await fetch(new URL('./official-conditions.json.gz',data.url));
        if(!hr.ok)throw Error('conditions');
        const hb=new Uint8Array(await hr.arrayBuffer());
        const dataset=JSON.parse(new TextDecoder().decode(hb[0]===31&&hb[1]===139?gunzipSync(hb):hb));
        graph.officialConditionIndex=createOfficialConditionIndex(dataset);
      }catch{graph.officialConditionIndex=null;}
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
      if(!result.error)result=withCandidates(result,data.startPlace,data.endPlace,data.options||{},data.construction,checker);
      if(['NO_ROUTE','NO_CONNECTION'].includes(result.error)&&result.failedPair&&constructionFresh(data.construction)){
        const {start:a,end:b}=result.failedPair,prefs={...data.options,startPlace:a,endPlace:b,lineAllowed:checker.allowed,diagnosePartial:true};
        const start=[a.lat,a.lon],end=[b.lat,b.lon],diagnostic=router(start,end,prefs);
        if(diagnostic.error===result.error){
          const partialRoute=verifiedPartialRoute(diagnostic,start,end,prefs,data.construction,{verifyLocal,checker,resolvedStart:a,resolvedEnd:b});
          result={...result,...(diagnostic.routeGap?{routeGap:diagnostic.routeGap}:{}),...(partialRoute?{partialRoute}:{})};
        }
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
        if(checker){result=improvePedestrianRoute(result,data.start,data.end,data.options||{},data.construction,{graph:routeGraph,router,verifyLocal,checker});
          if(!result.error&&result.provider!=='taipei-official')result=withCandidates(result,data.options?.startPlace||{lat:data.start[0],lon:data.start[1]},data.options?.endPlace||{lat:data.end[0],lon:data.end[1]},data.options||{},data.construction,checker);}}
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
      if(!result.error&&result.provider==='taipei-official'){
        let checker;try{checker=createConstructionChecker(data.construction);}catch{result={error:'CONSTRUCTION_UNAVAILABLE'};}
        if(checker){
          const opts=data.options||{},startPlace=opts.startPlace||{lat:data.start[0],lon:data.start[1]},endPlace=opts.endPlace||{lat:data.end[0],lon:data.end[1]},deps={graph:routeGraph,router,verifyLocal,facilities,checker};
          const local=planImprovedPlaces(startPlace,endPlace,opts,data.construction,deps);
          let localCandidates=[];
          if(!local.error){const a=local.resolvedStart||startPlace,b=local.resolvedEnd||endPlace;
            // Compare only the exact same requested endpoints, not alternative station exits.
            if(metres([a.lat,a.lon],data.start)<=.001&&metres([b.lat,b.lon],data.end)<=.001){
              const found=findRouteCandidates(local,data.start,data.end,{...opts,startPlace:a,endPlace:b},data.construction,deps);
              if(found.error==='CONSTRUCTION_UNAVAILABLE')result=found;else localCandidates=found.candidates||[];
            }}
          if(!result.error){const compared=compareOfficialAndLocal(result,data.start,data.end,opts,data.construction,{graph:routeGraph,verifyOfficial,verifyLocal,checker},{localCandidates});
            if(compared.error)result=compared;else{const ordered=[...compared.candidates].sort((a,b)=>b.score-a.score||a.metrics.distanceMetres-b.metrics.distanceMetres||a.id.localeCompare(b.id)),selected=ordered[0];
              result=selected?{...selected.route,routeCandidates:compared,selectedCandidateId:selected.id}:result;}}
        }
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
            if(constructionFresh(data.construction)){
              const diagnostic=router(start,end,{...prefs,diagnosePartial:true});
              if(diagnostic.error===candidate.error){
                const partialRoute=verifiedPartialRoute(diagnostic,start,end,prefs,data.construction,{verifyLocal,checker,resolvedStart:prefs.startPlace,resolvedEnd:prefs.endPlace});
                return {...candidate,...(diagnostic.routeGap?{routeGap:diagnostic.routeGap}:{}),...(partialRoute?{partialRoute}:{})};
              }
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
        if(!result.error){result=improvePedestrianRoute(result,data.start,data.end,data.options||{},data.construction,{graph:routeGraph,router,verifyLocal,checker});
          if(!result.error)result=withCandidates(result,data.options?.startPlace||{lat:data.start[0],lon:data.start[1]},data.options?.endPlace||{lat:data.end[0],lon:data.end[1]},data.options||{},data.construction,checker);}
      }
      if(!constructionFresh(data.construction))result={error:'CONSTRUCTION_UNAVAILABLE'};
      postMessage({type:'route',id:data.id,result});
    }
  } catch (e) {
    postMessage({ type: "error", id: data.id, message: e.message });
  }
};
