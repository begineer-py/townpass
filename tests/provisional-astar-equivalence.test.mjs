import test from 'node:test';
import assert from 'node:assert/strict';
import proj4 from 'proj4';
import {createProvisionalNetwork} from '../src/provisional-network.mjs';
import {metres} from '../src/routing.mjs';
const twd='+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs';
const ll=([x,y])=>{const [lon,lat]=proj4(twd,'EPSG:4326',[x,y]);return [lat,lon]};

test('fine-grid A* and coarse-grid Dijkstra have equal cost on 100 mixed routes',()=>{
 const stamp=new Date().toISOString();let checked=0;
 for(const seed of [1,2,3,4,5]){
  const n=6,points=Array.from({length:n*n},(_,i)=>[303000+(i%n)*35,2778000+Math.floor(i/n)*35]),geo=points.map(ll),parts=[],edges=[],proof={schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};let serial=0;
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*n+x;for(const j of [x+1<n?i+1:-1,y+1<n?i+n:-1])if(j>=0){parts.push({qgsFid:String(++serial),partIndex:0,coordinates:[points[i],points[j]]});edges.push([i,j,metres(geo[i],geo[j])*(.55+((i*13+j*7+seed)%45)/100),0,[],{...proof}]);}}
  const area={type:'Polygon',coordinates:[[[121.52,25.10],[121.54,25.10],[121.54,25.12],[121.52,25.12],[121.52,25.10]]]},graph={officialPathEvidence:{schemaVersion:2},officialAreas:[area],officialCrossingAreas:[],roadGeometries:[[[121.79,25],[121.79,25.01]]],nodes:geo.map((p,i)=>[...p,0,i+1]),ways:[{highway:'footway',footway:'sidewalk',source:'osm',crossing:false}],edges};
  const base={parts,graph,osmEdgeIds:edges.map((_,i)=>i),sourceHash:'a'.repeat(64),facilities:[],places:[],snapshot:{schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]}};
  const astar=createProvisionalNetwork({...base,limits:{useAStar:true,maxMs:10000}}),dijkstra=createProvisionalNetwork({...base,limits:{useAStar:false,useCoarseGrid:true,maxMs:10000}});assert.equal(astar.error,undefined);assert.equal(dijkstra.error,undefined);
  for(let k=0;k<20;k++){let i=(seed*7+k*11)%(n*n),j=(seed*13+k*17+3)%(n*n);if(i===j)j=(j+1)%(n*n);const profile=[{},{area:2,sidewalk:2,shared:4},{join:2,official:3}][k%3];const a=astar.findRoute(geo[i],geo[j],{profile}),b=dijkstra.findRoute(geo[i],geo[j],{profile});assert.equal(a.error,b.error);assert.equal(a.error,undefined);assert.ok(Math.abs(a.searchCost-b.searchCost)<1e-6,`seed ${seed} case ${k}`);checked++;}
 }
 assert.equal(checked,100);
});
