// Prepare two independent frozen copies using exactly the same snapshot and
// selected public points. No production code or repository data are changed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
if(!process.argv[2])throw Error('Provide a complete, fresh frozen district run directory');
const original=path.resolve(process.argv[2]);
const origin=JSON.parse(fs.readFileSync(path.join(original,'results.json'))),sample=JSON.parse(fs.readFileSync(path.join(original,'sample.json')));
if(origin.stopReason!=='COMPLETE'||origin.results.length!==sample.samples.length)throw Error('Need complete frozen baseline');
const snapshot=JSON.parse(fs.readFileSync(path.join(original,'snapshot.json')));
const {constructionFresh}=await import(pathToFileURL(path.join(original,'frozen/src/construction.mjs')).href);
if(!constructionFresh(snapshot))throw Error('Original snapshot expired; do not mix');
const h=x=>createHash('sha256').update(x).digest('hex'),fh=p=>h(fs.readFileSync(p));
if(fh(path.join(original,'snapshot.json'))!==origin.snapshotSha256)throw Error('Original snapshot changed');
if(fh(path.join(original,'sample.json'))!==origin.sampleSha256||treeHash(path.join(original,'frozen/src'))!==origin.sourceTreeSha256)throw Error('Original sample or source changed');
for(const [name,expected] of Object.entries(origin.dataSha256))if(fh(path.join(original,'frozen/data',`${name}.json.gz`))!==expected)throw Error(`Original data changed: ${name}`);
const districts=['中正區','大同區','中山區','松山區','大安區','萬華區','信義區','士林區','北投區','內湖區','南港區','文山區'];
const bins=['0.3–1km','1–2km','2–4km'],seed='candidate-budget-district-20261108-v1',selected=[],missing=[];
for(const [i,district] of districts.entries()){
 const eligible=origin.results.filter(r=>r.district===district&&!r.error&&r.candidateCount>0&&r.resolvedStart&&r.resolvedEnd);
 const target=bins[i%bins.length],preferred=eligible.filter(r=>r.bin===target);
 const pool=(preferred.length?preferred:eligible).sort((a,b)=>h(seed+'|'+a.startId+'|'+a.endId).localeCompare(h(seed+'|'+b.startId+'|'+b.endId)));
 if(!pool.length){missing.push({district,target,reason:'no-successful-candidate'});continue;}
 const row=pool[0],pair=sample.samples[row.index];
 selected.push({...pair,originalIndex:row.index,targetBin:target,usedFallback:row.bin!==target});
}
const output=fs.mkdtempSync(path.join(os.tmpdir(),'townpass-district-budget-'));
const selectedFile=path.join(output,'budget-sample.json');
const report={seed,method:'Select one successful route with candidates per district by seeded hash, rotating distance bins; fallback to another successful bin when absent. This is an explicitly success-preselected comparison, not a citywide success sample.',snapshotSha256:origin.snapshotSha256,originalSourceSha256:origin.sourceTreeSha256,missing,samples:selected};
fs.writeFileSync(selectedFile,JSON.stringify(report,null,2)+'\n');
function treeHash(dir){const rows=[];function visit(d){for(const e of fs.readdirSync(d,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const p=path.join(d,e.name);if(e.isDirectory())visit(p);else if(e.isFile())rows.push(`${path.relative(dir,p).replaceAll('\\','/')} ${fh(p)}`);}}visit(dir);return h(rows.join('\n'));}
const controlScript=path.join(here,'benchmark-district-routes.mjs'),proximityScript=path.join(here,'district-endpoint-proximity.mjs');
for(const variant of ['budget-control','budget-expanded']){
 const dir=path.join(output,variant);if(fs.existsSync(dir))throw Error(`Refusing to overwrite ${dir}`);
 const frozen=path.join(dir,'frozen');fs.mkdirSync(frozen,{recursive:true});
 fs.cpSync(path.join(original,'frozen/src'),path.join(frozen,'src'),{recursive:true});
 fs.copyFileSync(path.join(original,'frozen/package.json'),path.join(frozen,'package.json'));
 fs.symlinkSync(fs.realpathSync(path.join(original,'frozen/node_modules')),path.join(frozen,'node_modules'),process.platform==='win32'?'junction':'dir');
 fs.symlinkSync(path.resolve(original,'frozen/data'),path.join(frozen,'data'),process.platform==='win32'?'junction':'dir');
 if(variant==='budget-expanded'){
  const file=path.join(frozen,'src/route-candidates.mjs');let text=fs.readFileSync(file,'utf8');
  for(const [a,b] of [['totalMs:config.totalMs??4000','totalMs:config.totalMs??10000'],['maxVisited:config.maxVisited??40000','maxVisited:config.maxVisited??100000'],['totalVisited:config.totalVisited??160000','totalVisited:config.totalVisited??400000'],['maxAttempts:config.maxAttempts??18','maxAttempts:config.maxAttempts??36']]){
   if(text.split(a).length!==2)throw Error(`Candidate config not unique: ${a}`);text=text.replace(a,b);
  }fs.writeFileSync(file,text);
 }
 fs.copyFileSync(path.join(original,'snapshot.json'),path.join(dir,'snapshot.json'));
 fs.copyFileSync(path.join(original,'endpoint-proximity.json'),path.join(dir,'endpoint-proximity.json'));
 if(origin.shadowReport)fs.copyFileSync(path.join(original,'shadow-summary.json'),path.join(dir,'shadow-summary.json'));
 fs.writeFileSync(path.join(dir,'sample.json'),JSON.stringify(report));
 const meta={...origin,method:report.method+'; '+variant,sourceTreeSha256:treeHash(path.join(frozen,'src')),sampleSha256:fh(path.join(dir,'sample.json')),
  scriptSha256:fh(controlScript),endpointProximityScriptSha256:fh(proximityScript),snapshotSha256:fh(path.join(dir,'snapshot.json')),
  endpointProximitySha256:fh(path.join(dir,'endpoint-proximity.json')),sampleCount:selected.length,results:[]};
 delete meta.stopReason;fs.writeFileSync(path.join(dir,'results.json'),JSON.stringify(meta,null,2));
 console.log(JSON.stringify({variant,dir,source:meta.sourceTreeSha256,snapshot:meta.snapshotSha256,count:selected.length}));
}
console.log(JSON.stringify({missing,selection:selected.map(x=>({district:x.district,bin:x.bin,target:x.targetBin,fallback:x.usedFallback,start:x.start,end:x.end,index:x.originalIndex+1}))}));
