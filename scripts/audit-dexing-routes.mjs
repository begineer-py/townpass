import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const base=resolve(process.argv[2]||'src'),moduleFor=n=>import(pathToFileURL(resolve(base,n)).href);
const [{createLocalRouteVerifier},{createVerifiedRouter,planImprovedPlaces},{createConstructionChecker},{edgeAllowed}]=await Promise.all(['local-route-verifier.mjs','pedestrian-planning.mjs','construction.mjs','routing.mjs'].map(moduleFor));
const load=n=>JSON.parse(gunzipSync(readFileSync(`public/data/${n}.json.gz`))),graph=load('graph'),facilities=load('facilities'),places=load('places');
const options={identity:'wheelchair',minWidth:.9,maxSlope:1000000,knownOnly:false,mode:'balanced',avoidSteps:true,officialOnly:false};
const snapshot={schemaVersion:1,fetchedAt:new Date().toISOString(),sourceUpdatedAt:new Date().toISOString(),works:[]},checker=createConstructionChecker(snapshot),verifyLocal=createLocalRouteVerifier(graph,facilities,places),router=createVerifiedRouter(graph,verifyLocal);
const walking=new Set(['footway','path','pedestrian','corridor']),usable=new Set();
for(const e of graph.edges){const w=graph.ways[e[3]];if(w&&w.source!=='osm-shared-street'&&walking.has(w.highway)&&w.crossing!==true&&w.footway!=='crossing'&&!e[5]?.gradeSeparatedPedestrian&&edgeAllowed(w,options,e[5])){usable.add(e[0]);usable.add(e[1]);}}
function choose(lat,lon,n){let candidates=[];for(const i of usable){const p=graph.nodes[i],d=Math.hypot((p[0]-lat)*111195,(p[1]-lon)*100700);if(d<=200)candidates.push({i,p,d});}candidates.sort((a,b)=>a.d-b.d);if(!candidates.length)return null;const p=candidates[0].p;return {id:`audit-${n}`,name:`audit-${n}`,lat:p[0],lon:p[1],selectionKind:'user'};}
const coordinates=[['德行東路西段',25.108,121.5283,25.1091,121.5321],['忠誠路南北',25.1064,121.530,25.1112,121.530]];
for(const [name,a,b,c,d] of coordinates){const start=choose(a,b,`${name}-a`),end=choose(c,d,`${name}-b`);if(!start||!end){console.log(JSON.stringify({name,error:'NO_NEARBY_PEDESTRIAN_NODES'}));continue;}
 const started=Date.now();try{const r=planImprovedPlaces(start,end,options,snapshot,{graph,router,verifyLocal,facilities,checker},{totalMs:3000,maxIterations:2});let shared=0,walk=0;for(const s of r.tierSegments||[])if(s.sharedRoad)shared+=s.distance;else if(!s.crossing)walk+=s.distance;
 const straight=Math.hypot((end.lat-start.lat)*111195,(end.lon-start.lon)*100700);
 console.log(JSON.stringify({name,start:[start.lat,start.lon],end:[end.lat,end.lon],straight:Math.round(straight),error:r.error||null,distance:r.distance??null,routeToStraightRatio:r.distance?Number((r.distance/straight).toFixed(2)):null,shared:Math.round(shared),pedestrian:Math.round(walk),verified:r.geometryVerification||null,blocked:r.construction?.blocked?.length??null,improvement:r.pedestrianImprovement?.status||null,elapsedMs:Date.now()-started}));}catch(e){console.log(JSON.stringify({name,error:e.code||String(e),elapsedMs:Date.now()-started}));}}
