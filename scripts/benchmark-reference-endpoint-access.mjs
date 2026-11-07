// Reproduce public-node reference endpoint access before/after the OSM seed change.
// Construction is deliberately empty: these measurements are not navigation approval.
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {selectReferenceRegion} from '../src/reference-region.mjs';
import {createProvisionalNetwork} from '../src/provisional-network.mjs';
import {verifyOfficialReferenceRoute} from '../src/official-reference-validator.mjs';
import {createLocalRouteVerifier} from '../src/local-route-verifier.mjs';
import {createOfficialConditionIndex} from '../src/official-conditions.mjs';

const baselineRef=process.env.REFERENCE_BASELINE_REF||'f38d141';
if(!/^[a-f0-9]{7,40}$/.test(baselineRef))throw Error('INVALID_BASELINE_REF');
const temp=new URL(`../src/.reference-baseline-${process.pid}-${Date.now()}.mjs`,import.meta.url);
const load=name=>JSON.parse(gunzipSync(fs.readFileSync(new URL(`../public/data/${name}.json.gz`,import.meta.url))));
const digest=name=>createHash('sha256').update(fs.readFileSync(new URL(`../public/data/${name}.json.gz`,import.meta.url))).digest('hex');
try{
 fs.writeFileSync(temp,execFileSync('git',['show',`${baselineRef}:src/provisional-network.mjs`]));
 const old=(await import(temp.href)).createProvisionalNetwork;
 const graph=load('graph'),asset=load('official-sidewalk-reference'),facilities=load('facilities'),places=load('places'),stamp=new Date().toISOString();
 graph.officialConditionIndex=createOfficialConditionIndex(load('official-conditions'));
 const snapshot={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]},options={minWidth:.9,maxSlope:1000000,avoidSteps:true};
 const region=selectReferenceRegion(asset,graph,[25.103,121.528],[25.112,121.538],500);
 const args={...region,graph,facilities,places,snapshot,routingOptions:options},before=old(args),after=createProvisionalNetwork(args);
 if(before.error||after.error)throw Error(`NETWORK_FAILED: ${before.error||after.error}`);
 const edges=graph.edges.filter(edge=>{const p=graph.nodes[edge[0]],w=graph.ways[edge[3]];return p&&!p[2]&&p[0]>25.104&&p[0]<25.110&&p[1]>121.53&&p[1]<121.535&&['footway','path','pedestrian','corridor'].includes(w.highway);});
 const points=[];for(const edge of edges){const p=graph.nodes[edge[0]].slice(0,2);if(points.every(q=>Math.hypot((p[0]-q[0])*111195,(p[1]-q[1])*100700)>80))points.push(p);if(points.length===25)break;}
 if(points.length<14)throw Error('INSUFFICIENT_PUBLIC_NODES');
 const verifyLocal=createLocalRouteVerifier(graph,facilities,places),results=[];
 for(let i=0;i<14;i++){
  const start=points[i],end=points[(i+Math.floor(points.length/2))%points.length];
  const check=network=>{const route=network.findRoute(start,end,{deadline:Date.now()+1200});if(route.error)return {status:route.error};const screened=verifyOfficialReferenceRoute({route,parts:region.parts,sourceHash:region.sourceHash,graph,snapshot,verifyLocal,start,end,options});return {status:screened.error||screened.verification,distanceMetres:route.distanceMetres};};
  results.push({start,end,before:check(before),after:check(after)});
 }
 const ok=x=>x.status==='official-source-screened-v1',oldCount=results.filter(x=>ok(x.before)).length,newCount=results.filter(x=>ok(x.after)).length;
 const cases=[];
 for(const [name,start,end] of [['德行西段',[25.1088987,121.5279412],[25.1091826,121.5325688]],['忠誠南北',[25.1060689,121.5292698],[25.112411,121.5308079]]]){
  const local=selectReferenceRegion(asset,graph,start,end,1000),context={...local,graph,facilities,places,snapshot,routingOptions:options};
  const run=factory=>{const network=factory(context);if(network.error)return {error:network.error};const comparison=network.findCandidates(start,end,{totalMs:10000,maxVisitedTotal:160000});if(comparison.error)return {error:comparison.error};
   return {status:comparison.status,candidates:comparison.candidates.map(c=>{const screened=verifyOfficialReferenceRoute({route:c.route,parts:local.parts,sourceHash:local.sourceHash,graph,snapshot,verifyLocal,start,end,options});return {verified:screened.error||screened.verification,distanceMetres:c.route.distanceMetres,sidewalkMetres:c.coverage.generalSidewalkMetres,sharedMetres:c.coverage.sharedMetres};})};};
  cases.push({name,start,end,parts:local.parts.length,osmEdges:local.osmEdgeIds.length,before:run(old),after:run(createProvisionalNetwork)});
 }
 const report={createdAt:stamp,baselineRef,method:'First 14 deterministic pairs of public OSM pedestrian graph nodes in the 德行東路／忠義街 vicinity, sampled with 80m spacing; same source graph, source lines, construction snapshot, options and 1200ms per search. Two additional public graph-node cases compare up to four route candidates with a 10-second search budget.',limitations:'Synthetic empty construction snapshot; geometrically screened paths and estimated connectors are not confirmation of actual conditions or accessibility. This is a small local sample, not a citywide result or a user trip.',inputs:{graphSha256:digest('graph'),officialSourceSha256:digest('official-sidewalk-reference'),conditionsSha256:digest('official-conditions'),parts:region.parts.length,osmEdges:region.osmEdgeIds.length,constructionWorks:0},summary:{pairs:results.length,beforeVerified:oldCount,afterVerified:newCount,improved:results.filter(x=>!ok(x.before)&&ok(x.after)).length},results,cases};
 fs.writeFileSync(new URL('../reports/reference-endpoint-access-20261108.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report.summary));
}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
