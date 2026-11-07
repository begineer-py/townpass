import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createConstructionChecker,constructionFresh} from '../src/construction.mjs';
import {createLocalRouteVerifier} from '../src/local-route-verifier.mjs';
import {createVerifiedRouter,planImprovedPlaces} from '../src/pedestrian-planning.mjs';
import {findRouteCandidates,routeOverlapRatio} from '../src/route-candidates.mjs';
import {metres} from '../src/routing.mjs';
import {createOfficialConditionIndex} from '../src/official-conditions.mjs';

const load=n=>JSON.parse(gunzipSync(fs.readFileSync(`public/data/${n}.json.gz`)));
const graph=load('graph'),facilities=load('facilities'),places=load('places');
graph.officialConditionIndex=createOfficialConditionIndex(load('official-conditions'));
const pairs=JSON.parse(fs.readFileSync('reports/metro-sidewalk-approach-comparison.json')).results.filter((_,i)=>i%5===0);
const response=await fetch(process.env.BENCHMARK_URL||'http://127.0.0.1:5173/api/construction');if(!response.ok)throw Error(`Construction HTTP ${response.status}`);
const snapshot=await response.json(),checker=createConstructionChecker(snapshot),verifyLocal=createLocalRouteVerifier(graph,facilities,places),router=createVerifiedRouter(graph,verifyLocal),deps={graph,router,verifyLocal,facilities,checker};
const rows=[];
for(const pair of pairs){
 if(!constructionFresh(snapshot))throw Error('Construction snapshot expired');
 const start=facilities.find(p=>p.id===pair.startId),end=facilities.find(p=>p.id===pair.endId);if(!start||!end)throw Error('Missing station');
 const started=Date.now(),base=planImprovedPlaces(start,end,{officialOnly:false},snapshot,deps);
 if(base.error){rows.push({start:start.name,end:end.name,error:base.error,candidateCount:0,checks:[]});continue;}
 const a=base.resolvedStart||start,b=base.resolvedEnd||end,A=[a.lat,a.lon],B=[b.lat,b.lon],options={officialOnly:false,startPlace:a,endPlace:b};
 const result=findRouteCandidates(base,A,B,options,snapshot,deps);if(result.error)throw Error(result.error);
 const list=result.candidates,shortest=Math.min(...list.map(c=>c.metrics.distanceMetres)),checks=[];
 for(const c of list){
  const route=c.route,m=c.metrics,verified=verifyLocal({...route,coordinates:route.networkCoordinates||route.coordinates},A,B,options);
  const road=verified.error?null:checker.inspect(verified.coordinates),network=route.edgeIds.reduce((n,i)=>n+graph.edges[i][2],0);
  const expectedDistance=network+metres(A,graph.nodes[route.nodeIds[0]])+metres(B,graph.nodes[route.nodeIds.at(-1)]);
  const raw=40*m.explicitSidewalkMetres/m.distanceMetres-25*m.sharedMetres/m.distanceMetres-12*m.unknownMetres/m.distanceMetres-10*m.roughMetres/m.distanceMetres-15*m.estimatedMetres/m.distanceMetres-20*Math.max(0,m.distanceMetres-shortest)/shortest-(m.officialConditionCount==null?0:Math.min(20,2*m.officialConditionCount));
  const expectedScore=100/(1+Math.exp(-raw/20));
  const other=list.filter(x=>x!==c),overlaps=other.map(x=>routeOverlapRatio(graph,c.route,x.route,{maxComparisons:1000000}));
  checks.push({id:c.id,verified:!verified.error,constructionClear:!!road&&!road.blocked.length,distanceCorrect:Math.abs(expectedDistance-m.distanceMetres)<.001&&route.distance===Math.round(expectedDistance),scoreCorrect:Math.abs(expectedScore-c.score)<1e-7,distinct:overlaps.every(x=>x!==null&&x<.9),score:c.score,distanceMetres:m.distanceMetres,sidewalkMetres:m.explicitSidewalkMetres,sharedMetres:m.sharedMetres,unknownMetres:m.unknownMetres,estimatedMetres:m.estimatedMetres});
 }
 const ranked=list.every((c,i)=>!i||list[i-1].score>=c.score);
 rows.push({start:start.name,end:end.name,error:null,elapsedMs:Date.now()-started,candidateCount:list.length,ranked,checks});
 console.log(`${rows.length}/${pairs.length} ${start.name} → ${end.name}: ${list.length} candidates, ${ranked?'ranked':'ranking error'}`);
}
const all=rows.flatMap(r=>r.checks),report={checkedAt:new Date().toISOString(),sourceUpdatedAt:snapshot.sourceUpdatedAt,graphSha256:createHash('sha256').update(fs.readFileSync('public/data/graph.json.gz')).digest('hex'),method:'Every fifth case from the fixed 60 station pairs, fresh local graph and construction snapshot; checks algorithmic provenance, endpoint/edge reconstruction, construction, score formula, order and geometry overlap. No ground-truth on-site accessibility, no online official provider; these checks are not an accuracy rate for real-world route quality.',samplePairs:rows.length,completePairs:rows.filter(r=>!r.error).length,partialOrFailed:rows.filter(r=>r.error).length,candidates:all.length,passes:Object.fromEntries(['verified','constructionClear','distanceCorrect','scoreCorrect','distinct'].map(k=>[k,all.filter(x=>x[k]).length])),rankingPassed:rows.filter(r=>!r.error&&r.ranked).length,rows};
fs.writeFileSync('reports/current-recommendation-integrity-audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({samplePairs:report.samplePairs,completePairs:report.completePairs,partialOrFailed:report.partialOrFailed,candidates:report.candidates,passes:report.passes,rankingPassed:report.rankingPassed}));

