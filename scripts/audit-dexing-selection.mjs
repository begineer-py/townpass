// Actual local and independently screened official-source candidates plus
// the application's automatic comparison. Uses empty construction solely to
// isolate network connectivity; this is not an accessibility certification.
import {readFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';
import {createOfficialConditionIndex} from '../src/official-conditions.mjs';
import {createNearbyConditionAnnotator} from '../src/route-nearby-conditions.mjs';
import {createLocalRouteVerifier} from '../src/local-route-verifier.mjs';
import {createVerifiedRouter,planImprovedPlaces} from '../src/pedestrian-planning.mjs';
import {createConstructionChecker} from '../src/construction.mjs';
import {selectReferenceRegion} from '../src/reference-region.mjs';
import {createProvisionalNetwork} from '../src/provisional-network.mjs';
import {verifyOfficialReferenceRoute} from '../src/official-reference-validator.mjs';
import {chooseSidewalkImprovement,compareSidewalkRouteScores} from '../src/sidewalk-route-choice.mjs';
const load=n=>JSON.parse(gunzipSync(readFileSync(`public/data/${n}.json.gz`))),asset=load('official-sidewalk-reference'),facilities=load('facilities'),places=load('places'),conditions=load('official-conditions');
const options={identity:'wheelchair',minWidth:.9,maxSlope:1000000,knownOnly:false,mode:'balanced',avoidSteps:true,officialOnly:false};
for(const [name,a,b] of [['德行東路西段',[25.1088987,121.5279412],[25.1091826,121.5325688]],['忠誠路南北',[25.1060689,121.5292698],[25.112411,121.5308079]]]){
 const graph=load('graph');graph.officialConditionIndex=createOfficialConditionIndex(conditions);
 const raw=createLocalRouteVerifier(graph,facilities,places),annotate=createNearbyConditionAnnotator(graph.officialConditionIndex),verifyLocal=Object.assign((...args)=>annotate(raw(...args)),raw),router=createVerifiedRouter(graph,verifyLocal);
 const stamp=new Date().toISOString(),snapshot={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]},checker=createConstructionChecker(snapshot);
 const start={id:'audit-start',name:'audit-start',lat:a[0],lon:a[1],selectionKind:'user'},end={id:'audit-end',name:'audit-end',lat:b[0],lon:b[1],selectionKind:'user'};
 const local=planImprovedPlaces(start,end,options,snapshot,{graph,router,verifyLocal,facilities,checker},{totalMs:3000,maxIterations:2});
 const region=selectReferenceRegion(asset,graph,[25.103,121.528],[25.112,121.538],500),network=createProvisionalNetwork({...region,graph,facilities,places,snapshot,routingOptions:options});
 if(local.error||network.error){console.log(JSON.stringify({name,localError:local.error||null,networkError:network.error||null}));continue;}
 const rawRef=network.findRoute(a,b,{startPlace:start,endPlace:end,deadline:Date.now()+2500});
 if(rawRef.error){console.log(JSON.stringify({name,referenceError:rawRef.error}));continue;}
 const reference=verifyOfficialReferenceRoute({route:rawRef,parts:region.parts,sourceHash:region.sourceHash,graph,snapshot,verifyLocal,start:a,end:b,options,startPlace:start,endPlace:end});
 if(reference.error){console.log(JSON.stringify({name,referenceError:reference.error}));continue;}
 const candidate={id:'official-test',route:reference},args={currentRoute:local,referenceCandidates:[candidate],start,end,snapshot,referenceSnapshot:snapshot,referenceSourceHash:region.sourceHash};
 const compared=compareSidewalkRouteScores(args),choice=chooseSidewalkImprovement(args);
 console.log(JSON.stringify({name,status:compared.status,selected:choice?.candidate.id||null,local:compared.current?{...compared.current.metrics,score:compared.current.score.value}:null,reference:compared.referenceCandidates?.[0]?{...compared.referenceCandidates[0].metrics,score:compared.referenceCandidates[0].score.value}:null}));
}
