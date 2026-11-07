import { metres, ROUTING_POLICY } from "./routing.mjs";
import {verifiedPartialRoute} from "./partial-route.mjs";
import { gunzipSync } from "fflate";
import {createOfficialConditionIndex,officialConditionMetrics,officialConditionScore} from './official-conditions.mjs';
import { validateNetwork } from "./network-contract.mjs";
import { createOfficialRouteVerifier } from './verify-official-route.mjs';
import {routeAroundConstruction,resolveVerifiedRoute} from './construction-routing.mjs';
import {createConstructionChecker,constructionFresh} from './construction.mjs';
import {createDetourWaypoints} from './alternative-routes.mjs';
import {createLocalRouteVerifier,diagnoseConstruction} from './local-route-verifier.mjs';
import {createNearbyRoutes,verifyNearbyRoutes} from './nearby-routes.mjs';
import {createVerifiedRouter,planImprovedPlaces} from './pedestrian-planning.mjs';
import {improvePedestrianRoute,measurePedestrianRoute} from './pedestrian-improvement.mjs';
import {findRouteCandidates} from './route-candidates.mjs';
import {compareOfficialAndLocal} from './cross-source-candidates.mjs';
import {planConditionDetour} from './official-condition-detour.mjs';
import {diagnoseAvoidedStairs} from './route-avoidance.mjs';
import {createNearbyConditionAnnotator} from './route-nearby-conditions.mjs';
import {projectionLimitResponse} from './route-worker-errors.mjs';
import {createProvisionalNetwork} from './provisional-network.mjs';
import {selectReferenceRegion} from './reference-region.mjs';
import {decodeReferenceAsset} from './reference-integrity.mjs';
import {verifyOfficialReferenceRoute} from './official-reference-validator.mjs';
let router, verifyOfficial, verifyLocal, facilities, routePlaces, initialization, detourWaypoints, nearbyRoutes, routeGraph;
let routeGraphUrl, referenceAsset;
function prepareTask(){if(router?.resetProjectionsIfNeeded?.())nearbyRoutes=null;}
function avoidance(start,end,prefs,checker,known=[]){
  const avoidedStairs=diagnoseAvoidedStairs(router,start,end,prefs);
  let avoidedWorks=known;
  const {lineAllowed,...withoutClosures}=prefs;
  const direct=router(start,end,withoutClosures);
  if(!direct.error){
    const checked=verifyLocal(direct,start,end,withoutClosures);
    if(!checked.error){
      const found=checker.inspect(checked.coordinates).blocked;
      if(found.length)avoidedWorks=found;
    }
  }
  return {avoidedStairs,avoidedWorks};
}
function annotateAvoidance(result,start,end,prefs,checker){
  if(result?.error)return result;
  let diagnostic;
  try{diagnostic=avoidance(start,end,prefs,checker,result.construction?.avoidedWorks||[]);}
  catch(error){
    if(error?.code!=='PROJECTION_LIMIT')throw error;
    if(!['pedestrian-network-v1','official-polygons-and-crossings-v1'].includes(result.geometryVerification)||result.policyVersion!==ROUTING_POLICY)throw error;
    const work=checker.inspect(result.coordinates);if(work.blocked.length)return {error:'CONSTRUCTION_BLOCKED',construction:work};
    return {...result,avoidanceStatus:'projection-limit'};
  }
  const {avoidedStairs,avoidedWorks}=diagnostic;
  const construction=result.construction
    ? {...result.construction,avoided:avoidedWorks.length,avoidedWorks}
    : result.construction;
  return {...result,avoidedStairs,construction};
}
function withCandidates(base,startPlace,endPlace,options,snapshot,checker){
  if(base?.error)return base;
  const a=base.resolvedStart||startPlace,b=base.resolvedEnd||endPlace;
  if(!Number.isFinite(a?.lat)||!Number.isFinite(a?.lon)||!Number.isFinite(b?.lat)||!Number.isFinite(b?.lon))
    return {...base,routeCandidates:{status:'missing-endpoints',candidates:[]}};
  const prefs={...options,startPlace:a,endPlace:b};
  let choices;
  try{choices=findRouteCandidates(base,[a.lat,a.lon],[b.lat,b.lon],prefs,snapshot,{graph:routeGraph,router,verifyLocal,checker});}
  catch(error){
    if(error?.code!=='PROJECTION_LIMIT')throw error;
    if(!constructionFresh(snapshot))return {error:'CONSTRUCTION_UNAVAILABLE'};
    const checked=verifyLocal({...base,coordinates:base.networkCoordinates||base.coordinates},[a.lat,a.lon],[b.lat,b.lon],prefs);
    if(checked.error||checked.geometryVerification!=='pedestrian-network-v1'||checked.policyVersion!==ROUTING_POLICY)throw error;
    const work=checker.inspect(checked.coordinates);if(work.blocked.length)return {error:'CONSTRUCTION_BLOCKED',construction:work};
    if(!constructionFresh(snapshot))return {error:'CONSTRUCTION_UNAVAILABLE'};
    return {...base,...checked,construction:work,routeCandidates:{status:'projection-limit',candidates:[]}};
  }
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
    avoidedStairs:[...(a.avoidedStairs||[]),...(b.avoidedStairs||[])],
  };
}
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      routeGraphUrl=data.url;referenceAsset=null;
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
      const annotateNearbyConditions=createNearbyConditionAnnotator(graph.officialConditionIndex);
      const rawVerifyOfficial=createOfficialRouteVerifier(graph);
      verifyOfficial=(candidate,...args)=>{
        const result=rawVerifyOfficial(candidate,...args);
        if(result.error)return result;
        // The verified official geometry lacks OSM way attributes. Preserve
        // that uncertainty; proximity only describes nearby observations.
        return annotateNearbyConditions({...result,tierSegments:[{coordinates:result.coordinates,distance:result.distance,unknownWidth:true,unknownSlope:true,roughSurface:false,sharedRoad:false,tier:'official'}]});
      };
      const fr=await fetch(new URL('./facilities.json.gz',data.url));if(!fr.ok)throw Error('facilities');
      const fb=new Uint8Array(await fr.arrayBuffer());facilities=JSON.parse(new TextDecoder().decode(fb[0]===31&&fb[1]===139?gunzipSync(fb):fb));
      const pr=await fetch(new URL('./places.json.gz',data.url));if(!pr.ok)throw Error('places');
      const pb=new Uint8Array(await pr.arrayBuffer()),places=JSON.parse(new TextDecoder().decode(pb[0]===31&&pb[1]===139?gunzipSync(pb):pb));
      if(!Array.isArray(facilities)||!Array.isArray(places))throw Error('places');
      routePlaces=places;
      const rawVerifyLocal=createLocalRouteVerifier(graph,facilities,places);
      verifyLocal=Object.assign((...args)=>annotateNearbyConditions(rawVerifyLocal(...args)),rawVerifyLocal);
      router=createVerifiedRouter(graph,verifyLocal);
      detourWaypoints=createDetourWaypoints(graph);
      })();
      await initialization;
      postMessage({ type: "ready" });
    } else if(data.type==='reference-route'){
      await initialization;
      if(!constructionFresh(data.construction)){postMessage({type:'reference-route',id:data.id,result:{error:'CONSTRUCTION_UNAVAILABLE'}});return;}
      if(!referenceAsset){
        const [response,metadata]=await Promise.all([fetch(new URL('./official-sidewalk-reference.json.gz',routeGraphUrl)),fetch(new URL('./official-sidewalk-reference.meta.json',routeGraphUrl))]);
        if(!response.ok||!metadata.ok)throw Error('REFERENCE_DATA_UNAVAILABLE');
        referenceAsset=await decodeReferenceAsset(new Uint8Array(await response.arrayBuffer()),await metadata.json());
      }
      const region=selectReferenceRegion(referenceAsset,routeGraph,data.start,data.end);
      if(region.parts.length>10000||region.osmEdgeIds.length>50000){postMessage({type:'reference-route',id:data.id,result:{error:'PROVISIONAL_SEARCH_LIMIT'}});return;}
      const network=createProvisionalNetwork({...region,graph:routeGraph,facilities,places:routePlaces,snapshot:data.construction,routingOptions:data.options||{}});
      const comparison=network.error?network:network.findCandidates(data.start,data.end,{startPlace:data.startPlace,endPlace:data.endPlace});
      let result=comparison;
      if(!comparison.error){
        const checked=[];
        for(const candidate of comparison.candidates){
          const route=verifyOfficialReferenceRoute({route:candidate.route,parts:region.parts,sourceHash:region.sourceHash,graph:routeGraph,snapshot:data.construction,verifyLocal,start:data.start,end:data.end,startPlace:data.startPlace,endPlace:data.endPlace,options:data.options||{}});
          if(!route.error)checked.push(route);
        }
        if(!checked.length)result={error:'REFERENCE_VALIDATION_FAILED'};
        else {
          const shortest=Math.min(...checked.map(x=>x.distanceMetres)),candidates=checked.filter(x=>x.distanceMetres<=Math.min(shortest*1.3,shortest+300)+.00001).map((route,i)=>{
            let area=0,sidewalk=0,unknown=0,approach=0,joins=0;
            for(const segment of route.segments){const d=segment.distanceMetres;if(segment.officialAreaCovered)area+=d;if(segment.explicitSidewalk)sidewalk+=d;if(segment.kind!=='osm'||segment.unknownDimensions)unknown+=d;if(segment.kind==='endpoint-approach')approach+=d;if(segment.kind.endsWith('join'))joins++;}
            const conditionMetrics=officialConditionMetrics(route.officialConditions);const total=route.distanceMetres||1,scoreBreakdown={officialConditions:officialConditionScore(conditionMetrics.officialConditionWeight),officialArea:10*area/total,sidewalk:20*sidewalk/total,unknown:-12*unknown/total,estimatedApproach:-15*approach/total,joins:-Math.min(10,joins*2),detour:-20*Math.max(0,route.distanceMetres-shortest)/(shortest||1)};
            return {id:`official-${i}`,route,coverage:{officialAreaMetres:area,explicitSidewalkMetres:sidewalk,unknownMetres:unknown,estimatedApproachMetres:approach,unconfirmedJoinCount:joins,...conditionMetrics},scoreBreakdown,score:Math.max(0,Math.min(100,50+Object.values(scoreBreakdown).reduce((a,b)=>a+b,0)))};
          }).sort((a,b)=>b.score-a.score||a.route.distanceMetres-b.route.distanceMetres);
          result={kind:'official-passageway-comparison',sourceHash:region.sourceHash,constructionSourceUpdatedAt:data.construction.sourceUpdatedAt,status:comparison.status,candidates,recommendedCandidateId:candidates[0].id};
        }
      }
      postMessage({type:'reference-route',id:data.id,result});
    } else if(data.type==='nearby-positions'){
      await initialization;
      prepareTask();
      let checker;try{checker=createConstructionChecker(data.construction);}catch{postMessage({type:'nearby-positions',id:data.id,result:{error:'CONSTRUCTION_UNAVAILABLE'}});return;}
      if(!nearbyRoutes)nearbyRoutes=createNearbyRoutes(routeGraph,{router,verifyLocal,facilities});
      const result=nearbyRoutes(data.startPlace,data.endPlace,data.options||{},data.construction,checker,{radius:120,includeOuter:true});
      if(result.error){postMessage({type:'nearby-positions',id:data.id,result});return;}
      const verified=verifyNearbyRoutes(result,data.startPlace,data.endPlace,data.options||{},data.construction,{graph:routeGraph,router,verifyLocal,facilities,checker});
      if(verified.error){postMessage({type:'nearby-positions',id:data.id,result:verified});return;}
      postMessage({type:'nearby-positions',id:data.id,result:{...result,verifiedCandidates:verified.candidates,truncated:verified.truncated,searchStatus:verified.searchStatus}});
    } else if(data.type==='avoid-official-condition'){
      await initialization;
      prepareTask();
      let checker;try{checker=createConstructionChecker(data.construction);}catch{postMessage({type:'avoid-official-condition',id:data.id,result:{error:'CONSTRUCTION_UNAVAILABLE'}});return;}
      const result=planConditionDetour(data.startPlace,data.endPlace,data.options||{},data.construction,{graph:routeGraph,router,verifyLocal,facilities,checker},data.targets);
      postMessage({type:'avoid-official-condition',id:data.id,result});
    } else if(data.type==='plan-places'){
      await initialization;
      prepareTask();
      let checker;try{checker=createConstructionChecker(data.construction);}catch{postMessage({type:'route',id:data.id,result:{error:'CONSTRUCTION_UNAVAILABLE'}});return;}
      let result=planImprovedPlaces(data.startPlace,data.endPlace,data.options||{},data.construction,{graph:routeGraph,router,verifyLocal,facilities,checker});
      if(!result.error)result=withCandidates(result,data.startPlace,data.endPlace,data.options||{},data.construction,checker);
      if(!result.error){
        const a=result.resolvedStart||data.startPlace,b=result.resolvedEnd||data.endPlace;
        if(Number.isFinite(a?.lat)&&Number.isFinite(b?.lat))
          result=annotateAvoidance(result,[a.lat,a.lon],[b.lat,b.lon],{...data.options,startPlace:a,endPlace:b,lineAllowed:checker.allowed},checker);
      }
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
      prepareTask();
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
          try{
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
          }catch(error){
            if(error?.code!=='PROJECTION_LIMIT')throw error;
            if(!constructionFresh(data.construction))result={error:'CONSTRUCTION_UNAVAILABLE'};
            else if(result?.geometryVerification!=='official-polygons-and-crossings-v1'||result.policyVersion!==ROUTING_POLICY)throw error;
            else {const work=checker.inspect(result.coordinates);result=work.blocked.length?{error:'CONSTRUCTION_BLOCKED',construction:work}:{...result,construction:work,routeCandidates:{status:'projection-limit',candidates:[]}};}
          }
        }
      }
      if(!result.error){
        try{const checker=createConstructionChecker(data.construction);result=annotateAvoidance(result,data.start,data.end,{...data.options,lineAllowed:checker.allowed},checker);}catch(error){if(error?.code==='PROJECTION_LIMIT')throw error;}
      }
      if(!constructionFresh(data.construction))result={error:'CONSTRUCTION_UNAVAILABLE'};
      if(result.error && ['OFFICIAL_PATH_UNVERIFIED','OFFICIAL_ROAD_CONFLICT','OFFICIAL_CROSSING_UNVERIFIED','OFFICIAL_ENTRY_UNVERIFIED','CONSTRUCTION_BLOCKED'].includes(result.error))result.detourWaypoints=detourWaypoints(data.start,data.end,result.detourCenter);
      postMessage({type:'verified-official',id:data.id,result});
    } else if (data.type === "route") {
      await initialization;
      prepareTask();
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
        if(!result.error){
          const work=checker.inspect(result.coordinates);
          const left=avoidance(data.start,data.via,{...data.options,endPlace:null,lineAllowed:checker.allowed},checker,a.construction?.avoidedWorks||[]);
          const right=avoidance(data.via,data.end,{...data.options,startPlace:null,lineAllowed:checker.allowed},checker,b.construction?.avoidedWorks||[]);
          const avoidedWorks=[...left.avoidedWorks,...right.avoidedWorks];
          result={...result,provider:'local-verified',geometryVerification:a.geometryVerification,construction:{...work,avoided:avoidedWorks.length,avoidedWorks},avoidedStairs:[...left.avoidedStairs,...right.avoidedStairs]};
        }
      }else{
        result=leg(data.start,data.end);
        if(!result.error){result=improvePedestrianRoute(result,data.start,data.end,data.options||{},data.construction,{graph:routeGraph,router,verifyLocal,checker});
          if(!result.error)result=withCandidates(result,data.options?.startPlace||{lat:data.start[0],lon:data.start[1]},data.options?.endPlace||{lat:data.end[0],lon:data.end[1]},data.options||{},data.construction,checker);}
        result=annotateAvoidance(result,data.start,data.end,{...data.options,lineAllowed:checker.allowed},checker);
      }
      if(!constructionFresh(data.construction))result={error:'CONSTRUCTION_UNAVAILABLE'};
      postMessage({type:'route',id:data.id,result});
    }
  } catch (e) {
    if(e?.code==='PROJECTION_LIMIT'){
      postMessage(projectionLimitResponse(data.type,data.id));return;
    }
    postMessage({ type: "error", id: data.id, message: e.message });
  }
};
