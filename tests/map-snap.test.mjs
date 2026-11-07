import test from 'node:test';
import assert from 'node:assert/strict';
import proj4 from 'proj4';
import {snapMapPoint} from '../src/map-snap.mjs';
import {createLocalRouteVerifier} from '../src/local-route-verifier.mjs';
import {createVerifiedRouter} from '../src/pedestrian-planning.mjs';
const twd='+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs';
const a=[25,121.5],b=[25,121.501],proof={schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
const snapshot=(works=[])=>{const t=new Date().toISOString();return {schemaVersion:1,fetchedAt:t,sourceUpdatedAt:t,works};};
const emptyAsset={schemaVersion:1,source:'official-passageway',crs:'EPSG:3826',sourceHash:'a'.repeat(64),parts:[]};
function setup({road=[[[121.51,25],[121.51,25.01]]],way={highway:'footway',width:2,slope:0},works=[]}={}){
 const graph={officialPathEvidence:{schemaVersion:2},nodes:[[...a,0],[...b,0]],ways:[way],edges:[[0,1,100,0,[],proof]],officialAreas:[],officialCrossingAreas:[],roadGeometries:road};
 const verifyLocal=createLocalRouteVerifier(graph),router=createVerifiedRouter(graph,verifyLocal);
 return {graph,verifyLocal,router,snapshot:snapshot(works),asset:emptyAsset,options:{}};
}
const selection=(lat,lon)=>({id:'point-123',name:'地圖上選的位置',originKind:'map',lat,lon});
test('snaps a map point to mapped pedestrian geometry without changing original',()=>{
 const d=setup(),p=[25+20/111195,121.5005],place=selection(...p),result=snapMapPoint({...d,point:p,place,side:'end'});
 assert.equal(result.error,undefined);assert.equal(result.source,'osm');assert.equal(result.originalAccess,'unconfirmed');assert.deepEqual(result.original,p);assert.ok(Math.abs(result.distanceMetres-20)<.01);assert.ok(Math.abs(result.point[0]-25)<1e-9);assert.equal(d.graph.nodes.length,2);assert.equal(d.graph.edges.length,1);
});
test('never snaps beyond 30m, across an unmarked road, or onto closed works',()=>{
 const far=[25+30.1/111195,121.5005];assert.equal(snapMapPoint({...setup(),point:far,place:selection(...far),side:'end'}).error,'NO_NEARBY_PEDESTRIAN');
 const p=[25+20/111195,121.5005],road=[[[121.499,25+10/111195],[121.502,25+10/111195]]];assert.equal(snapMapPoint({...setup({road}),point:p,place:selection(...p),side:'end'}).error,'NO_NEARBY_PEDESTRIAN');
 const works=[{id:'closed',impact:'blocked',start:'',end:'',hours:'',geometries:[{type:'Point',coordinates:[[25,121.5005]]}]}];assert.equal(snapMapPoint({...setup({works}),point:p,place:selection(...p),side:'end'}).error,'NO_NEARBY_PEDESTRIAN');
});
test('source lines compete on true distance and preserve source identity',()=>{
 const d=setup(),p=[25+20/111195,121.5005],s0=[25+18/111195,121.5002],s1=[25+18/111195,121.5008],xy=p=>proj4('EPSG:4326',twd,[p[1],p[0]]),u=xy(s0),v=xy(s1);
 d.asset={...emptyAsset,parts:[{qgsFid:'123',partIndex:0,bounds:[Math.min(u[0],v[0]),Math.min(u[1],v[1]),Math.max(u[0],v[0]),Math.max(u[1],v[1])],coordinates:[u,v]}]};
 const result=snapMapPoint({...d,point:p,place:selection(...p),side:'end'});assert.equal(result.error,undefined);assert.equal(result.source,'official-line');assert.equal(result.qgsFid,'123');assert.ok(result.distanceMetres<2.1);
});
test('rejects unavailable construction, untrusted selections and avoidance points',()=>{
 const d=setup(),p=[25+20/111195,121.5005],place=selection(...p);
 assert.equal(snapMapPoint({...d,point:p,place:{...place,id:'my-location',originKind:'gps'},side:'end'}).error,'SNAP_UNAVAILABLE');
 assert.equal(snapMapPoint({...d,point:p,place,side:'end',options:{avoidPoints:[[25,121.5005]]}}).error,'NO_NEARBY_PEDESTRIAN');
 assert.equal(snapMapPoint({...d,point:p,place,side:'end',snapshot:{...d.snapshot,sourceUpdatedAt:'2000-01-01T00:00:00Z'}}).error,'CONSTRUCTION_UNAVAILABLE');
});
