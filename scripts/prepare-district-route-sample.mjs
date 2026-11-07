import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const load=n=>JSON.parse(gunzipSync(fs.readFileSync(`${root}/public/data/${n}.json.gz`)));
const hash=x=>createHash('sha256').update(x).digest('hex');
const seed='taipei-public-district-20261108-v1';
const districts=['中正','大同','中山','松山','大安','萬華','信義','士林','北投','內湖','南港','文山'];
const bins=[{name:'0.3–1km',min:300,max:1000},{name:'1–2km',min:1000,max:2000},{name:'2–4km',min:2000,max:4000}];
const combos=[['station','toilet'],['toilet','station'],['health','place'],['place','health']];
const inputs=[...load('facilities'),...load('places')];
const groups=Object.fromEntries(districts.map(x=>[x,{station:[],toilet:[],health:[],place:[]}]));
let discarded={noExplicitDistrict:0,notUsedKind:0,invalid:0};
for(const p of inputs){
 const address=String(p.address||'').replaceAll('臺','台');
 const m=address.match(/^\d{0,6}台北市(中正|大同|中山|松山|大安|萬華|信義|士林|北投|內湖|南港|文山)區/);
 if(!m){discarded.noExplicitDistrict++;continue;}
 const kind=String(p.kind)==='20'?'station':['toilet','public-toilet'].includes(p.kind)?'toilet':['health','place'].includes(p.kind)?p.kind:null;
 if(!kind){discarded.notUsedKind++;continue;}
 if(!p.id||!p.name||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)){discarded.invalid++;continue;}
 groups[m[1]][kind].push(p);
}
const sorted=(list,key)=>list.sort((a,b)=>hash(seed+key+a.id).localeCompare(hash(seed+key+b.id)));
const counts={};
for(const district of districts){
 counts[district]={};
 for(const kind of Object.keys(groups[district])){
  const set=new Set(),items=[];
  for(const p of sorted(groups[district][kind],district+kind)){
   // Station line aliases and duplicated records at the same public location
   // should not dominate a district's sample.
   const key=kind==='station'?`${p.lat.toFixed(5)},${p.lon.toFixed(5)}`:`${p.lat.toFixed(6)},${p.lon.toFixed(6)},${p.name}`;
   if(set.has(key))continue;set.add(key);items.push(p);
  }
  counts[district][kind]=items.length;
  // Bound quadratic pair enumeration; sampling is fixed before routing.
  groups[district][kind]=items.slice(0,100);
 }
}
const distance=(a,b)=>Math.hypot((a.lat-b.lat)*111195,(a.lon-b.lon)*100700);
const samples=[],missing=[];
for(const district of districts){
 const seen=new Set();
 for(const bin of bins)for(const [from,to] of combos){
  const candidates=[];
  for(const a of groups[district][from])for(const b of groups[district][to]){
   const metres=distance(a,b),pair=[a.id,b.id].sort().join('|');
   if(a.id===b.id||seen.has(pair)||metres<bin.min||metres>=bin.max)continue;
   candidates.push({a,b,metres,pair,key:hash(`${seed}|${district}|${bin.name}|${from}|${to}|${a.id}|${b.id}`)});
  }
  candidates.sort((a,b)=>a.key.localeCompare(b.key));
  const c=candidates[0];
  if(!c){missing.push({district,bin:bin.name,from,to});continue;}
  seen.add(c.pair);
  samples.push({district:district+'區',bin:bin.name,fromKind:from,toKind:to,startId:c.a.id,endId:c.b.id,start:c.a.name,end:c.b.name,straightMetres:Math.round(c.metres)});
 }
}
const result={seed,method:'Explicit Taipei address with optional numeric postcode; both endpoints share address district. Station/toilet and health/place in both directions across three straight-line bins. Fixed hash order, capped at 100 points per district/category, no routing-based prefilter; addresses are not verified administrative boundaries.',inputHashes:Object.fromEntries(['facilities','places'].map(n=>[n,hash(fs.readFileSync(`${root}/public/data/${n}.json.gz`))])),counts,discarded,missing,samples};
const output=process.env.DISTRICT_SAMPLE_OUTPUT||path.join(root,'reports/district-route-sample-new.json');
fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({samples:samples.length,byDistrict:Object.fromEntries(districts.map(d=>[d,samples.filter(s=>s.district===d+'區').length])),missing,discarded,counts}));
