import {readFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';import {pathToFileURL} from 'node:url';import {resolve} from 'node:path';
const base=resolve(process.argv[2]||'src'),m=n=>import(pathToFileURL(resolve(base,n)).href);
const [{selectReferenceRegion},{createProvisionalNetwork},{verifyOfficialReferenceRoute},{createLocalRouteVerifier}]=await Promise.all(['reference-region.mjs','provisional-network.mjs','official-reference-validator.mjs','local-route-verifier.mjs'].map(m));
const load=n=>JSON.parse(gunzipSync(readFileSync(`public/data/${n}.json.gz`))),graph=load('graph'),asset=load('official-sidewalk-reference'),facilities=load('facilities'),places=load('places'),stamp=new Date().toISOString();
const snapshot={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]},options={minWidth:.9,maxSlope:1000000,avoidSteps:true};
const region=selectReferenceRegion(asset,graph,[25.103,121.528],[25.112,121.538],500),network=createProvisionalNetwork({...region,graph,facilities,places,snapshot,routingOptions:options});
if(network.error){console.log(JSON.stringify({error:network.error}));process.exit(1);}
const verifyLocal=createLocalRouteVerifier(graph,facilities,places);
for(const [name,start,end] of [['德行東路西段',[25.1088987,121.5279412],[25.1091826,121.5325688]],['忠誠路南北',[25.1060689,121.5292698],[25.112411,121.5308079]]]){
 const straight=Math.round(Math.hypot((end[0]-start[0])*111195,(end[1]-start[1])*100700)),r=network.findRoute(start,end,{deadline:Date.now()+2500});
 if(r.error){console.log(JSON.stringify({name,start,end,straight,error:r.error}));continue;}
 const s=verifyOfficialReferenceRoute({route:r,parts:region.parts,sourceHash:region.sourceHash,graph,snapshot,verifyLocal,start,end,options});
 if(s.error){console.log(JSON.stringify({name,start,end,straight,error:s.error}));continue;}
 const shared=s.segments.filter(x=>x.kind==='osm'&&x.sharedRoad).reduce((n,x)=>n+x.distanceMetres,0),pedestrian=s.segments.filter(x=>(x.kind==='official-line'&&!x.crossing)||(x.kind==='osm'&&!x.sharedRoad&&!x.crossing)).reduce((n,x)=>n+x.distanceMetres,0);
 console.log(JSON.stringify({name,start,end,straight,error:null,distance:Math.round(s.distanceMetres),routeToStraightRatio:Number((s.distanceMetres/straight).toFixed(2)),shared:Math.round(shared),pedestrian:Math.round(pedestrian),verified:s.verification}));
}
