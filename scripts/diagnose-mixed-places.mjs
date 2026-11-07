import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createRouter} from '../src/routing.mjs';
import {createLocalRouteVerifier} from '../src/local-route-verifier.mjs';
const load=n=>JSON.parse(gunzipSync(fs.readFileSync(`public/data/${n}.json.gz`)));
const graph=load('graph'),facilities=load('facilities'),places=load('places'),router=createRouter(graph),verify=createLocalRouteVerifier(graph,facilities,places);
const report=JSON.parse(fs.readFileSync(process.env.BENCHMARK_INPUT||'reports/mixed-place-benchmark.json'));
const lookup=new Map([...places,...facilities].map(p=>[p.id,p]));
const targets=report.results.map(row=>{const p=String(row.start.kind)==='20'?row.end:row.start;const source=lookup.get(p.id);if(!source)throw Error(`Missing POI ${p.id}`);return {type:row.type,poi:p,source};});
// Probe all strict cases before relaxing anything. These probes intentionally
// omit construction; they diagnose endpoint selection, not complete routes.
const strict=targets.map(({poi,source})=>router(poi.coordinate,poi.coordinate,{approachAllowed:(a,b)=>verify.approachAllowed(a,b,source)}));
const relaxed=targets.map(({poi})=>router(poi.coordinate,poi.coordinate,{approachAllowed:()=>true}));
const results=targets.map(({type,poi},i)=>({type,poi,strict:strict[i].error,relaxedApproach:relaxed[i].error,nearestNodeMetres:Number.isFinite(strict[i].startGap)?Math.round(strict[i].startGap):null}));
const output={checkedAt:new Date().toISOString(),benchmarkSeed:report.seed,method:'Single-point local endpoint probes without construction; relaxed removes only entrance-area or registered-exit evidence. Road mask, blocked nodes and 50m snap remain. SAME_POINT means an eligible candidate exists, not that a complete route exists or is safe.',strictReachable:results.filter(r=>r.strict==='SAME_POINT').length,relaxedReachable:results.filter(r=>r.relaxedApproach==='SAME_POINT').length,total:results.length,results};
fs.writeFileSync(process.env.DIAGNOSTIC_OUTPUT||'reports/mixed-place-diagnostics.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({total:output.total,strictReachable:output.strictReachable,relaxedReachable:output.relaxedReachable}));
