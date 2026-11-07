import test from 'node:test';import assert from 'node:assert/strict';import proj4 from 'proj4';
import {findProvisionalRoute} from '../src/provisional-network.mjs';
import {verifyOfficialReferenceRoute,referenceNavigationSteps} from '../src/official-reference-validator.mjs';
import {createLocalRouteVerifier} from '../src/local-route-verifier.mjs';
const twd='+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs';
const ll=p=>{const [lon,lat]=proj4(twd,'EPSG:4326',p);return [lat,lon];};
function fixture(){const a=[303000,2778000],b=[303100,2778000],c=[303101,2778000],d=[303201,2778000],stamp=new Date().toISOString(),parts=[{qgsFid:'1',partIndex:0,coordinates:[a,b]},{qgsFid:'2',partIndex:0,coordinates:[c,d]}],area={type:'Polygon',coordinates:[[[121.52,25.10],[121.54,25.10],[121.54,25.12],[121.52,25.12],[121.52,25.10]]]};
 const graph={officialPathEvidence:{schemaVersion:2},officialAreas:[area],officialCrossingAreas:[],roadGeometries:[[[121.79,25],[121.79,25.01]]],nodes:[],ways:[],edges:[]},snapshot={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]},start=ll(a),end=ll(d),sourceHash='a'.repeat(64),verifyLocal=createLocalRouteVerifier(graph,[],[]);
 return {parts,graph,snapshot,start,end,sourceHash,verifyLocal,facilities:[],places:[],osmEdgeIds:[],options:{}};}
test('screens authentic source segments and 2m joins without claiming prior OSM verification',()=>{
 const f=fixture(),route=findProvisionalRoute(f);assert.equal(route.error,undefined);
 const checked=verifyOfficialReferenceRoute({...f,route});assert.equal(checked.error,undefined);assert.equal(checked.verification,'official-source-screened-v1');assert.equal(checked.navigationAllowed,true);assert.equal(checked.geometryVerification,undefined);assert.equal(checked.unknownGrade,true);
 for(const bad of [
  {...route,sourceHash:'b'.repeat(64)},
  {...route,distanceMetres:route.distanceMetres-20},
  {...route,segments:route.segments.map(s=>s.kind==='source-join'?{...s,gapMetres:0}:s)},
  {...route,segments:route.segments.map(s=>s.kind==='official-line'?{...s,qgsFid:'999'}:s)},
 ])assert.equal(verifyOfficialReferenceRoute({...f,route:bad}).error,'REFERENCE_VALIDATION_FAILED');
});
test('rejects stale construction, missing source, known road crossing and known blockers',()=>{
 const f=fixture(),route=findProvisionalRoute(f);assert.equal(route.error,undefined);
 assert.equal(verifyOfficialReferenceRoute({...f,route,parts:[]}).error,'REFERENCE_VALIDATION_FAILED');
 const mid=ll([303100.5,2778000]),cross={...f.graph,roadGeometries:[[[mid[1],mid[0]-.0001],[mid[1],mid[0]+.0001]]]};
 assert.equal(verifyOfficialReferenceRoute({...f,route,graph:cross}).error,'REFERENCE_VALIDATION_FAILED');
 const blocked={...f.graph,nodes:[[...mid,1,1]]};assert.equal(verifyOfficialReferenceRoute({...f,route,graph:blocked}).error,'REFERENCE_VALIDATION_FAILED');
 assert.equal(verifyOfficialReferenceRoute({...f,route,snapshot:{...f.snapshot,sourceUpdatedAt:'2000-01-01T00:00:00Z'}}).error,'CONSTRUCTION_UNAVAILABLE');
});

test('rebuilds presentation from screened segments instead of trusting forged output',()=>{
 const f=fixture(),route=findProvisionalRoute(f);const checked=verifyOfficialReferenceRoute({...f,route:{...route,coordinates:[f.start,[25.2,121.7],f.end],steps:[{name:'FORGED'}],score:100,unknownGrade:false,endpointAccess:'confirmed'}});
 assert.equal(checked.error,undefined);assert.ok(!checked.coordinates.some(p=>p[0]===25.2));assert.ok(checked.steps.every(s=>s.name!=='FORGED'));assert.equal(checked.unknownGrade,true);assert.equal(checked.endpointAccess,'unconfirmed');assert.equal(checked.score,undefined);assert.ok(checked.steps.some(s=>s.name==='官方通行線'));
});

test('straight pieces and tiny joins combine without reporting zero metres or fake U-turns',()=>{
 const p=(x,y)=>[25+y/111195,121.5+x/100700],seg=(kind,a,b,d)=>({kind,coordinates:[p(...a),p(...b)],distanceMetres:d});
 const segments=[seg('official-line',[0,0],[10,0],10),seg('official-line',[10,0],[20,0],10),seg('source-join',[20,0],[20,.3],.3),seg('official-line',[20,.3],[30,.3],10),seg('official-line',[30,.3],[30.1,.3],.1)];
 const steps=referenceNavigationSteps(segments,{});
 assert.equal(steps.length,1);assert.equal(steps[0].turn,'直行');assert.equal(steps[0].access,'unconfirmed');assert.ok(Math.abs(steps[0].distance-30.4)<1e-8);assert.ok(steps.every(s=>Math.round(s.distance)>0));
});
test('real turns survive short connectors and gradual changes accumulate',()=>{
 const p=(x,y)=>[25+y/111195,121.5+x/100700],seg=(kind,a,b)=>({kind,coordinates:[p(...a),p(...b)],distanceMetres:Math.hypot(b[0]-a[0],b[1]-a[1])});
 const steps=referenceNavigationSteps([seg('official-line',[0,0],[10,0]),seg('source-join',[10,0],[10,.3]),seg('official-line',[10,.3],[10,10.3]),seg('official-line',[10,10.3],[0,10.3])],{});
 assert.deepEqual(steps.map(s=>s.turn),['直行','左轉','左轉']);
 assert.ok(Math.abs(steps.reduce((n,s)=>n+s.distance,0)-30.3)<1e-8);
 const reversal=referenceNavigationSteps([seg('official-line',[0,0],[10,0]),seg('source-join',[10,0],[10,.3]),seg('official-line',[10,.3],[0,.3])],{});
 assert.equal(reversal.at(-1).turn,'迴轉');
 const at=(degrees,d)=>[d*Math.sin(degrees*Math.PI/180),d*Math.cos(degrees*Math.PI/180)],a=[0,0],b=at(0,10),b20=at(20,10),c=[b[0]+b20[0],b[1]+b20[1]],b40=at(40,10),d=[c[0]+b40[0],c[1]+b40[1]];
 const curved=referenceNavigationSteps([seg('official-line',a,b),seg('official-line',b,c),seg('official-line',c,d)],{});
 assert.deepEqual(curved.map(s=>s.turn),['直行','右轉']);
});
test('estimated endpoint approach does not make the first route direction a fake turn',()=>{
 const p=(x,y)=>[25+y/111195,121.5+x/100700];
 const steps=referenceNavigationSteps([{kind:'endpoint-approach',coordinates:[p(0,0),p(10,0)],distanceMetres:10},{kind:'official-line',coordinates:[p(10,0),p(10,20)],distanceMetres:20}],{});
 assert.equal(steps.length,2);assert.equal(steps[0].access,'unconfirmed');assert.equal(steps[1].turn,'直行');assert.equal(steps[0].distance+steps[1].distance,30);
});

test('OSM crossing marker is rebuilt from graph rather than candidate claims',()=>{
 const n=(x,y)=>[25.11+y/111195,121.53+x/100700],xy=p=>proj4('EPSG:4326',twd,[p[1],p[0]]),proof={schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true},area={type:'Polygon',coordinates:[[[121.52,25.10],[121.54,25.10],[121.54,25.12],[121.52,25.12],[121.52,25.10]]]};
 const graph={officialPathEvidence:{schemaVersion:2},officialAreas:[area],officialCrossingAreas:[],roadGeometries:[[[121.79,25],[121.79,25.01]]],nodes:[[...n(0,0),0,1],[...n(300,0),0,2]],ways:[{highway:'footway',footway:'crossing',width:2,slope:0}],edges:[[0,1,300,0,[n(150,25)],proof]]};
 const parts=[{qgsFid:'101',partIndex:0,coordinates:[xy(n(80,33.333)),xy(n(80,13.833))]},{qgsFid:'102',partIndex:0,coordinates:[xy(n(180,40)),xy(n(180,20.5))]}],stamp=new Date().toISOString(),sourceHash='a'.repeat(64),snapshot={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]},verifyLocal=createLocalRouteVerifier(graph,[],[]),start=n(80,33.333),end=n(180,40),base={parts,graph,sourceHash,osmEdgeIds:[0],facilities:[],places:[],snapshot,verifyLocal,options:{},start,end};
 const route=findProvisionalRoute(base);assert.equal(route.error,undefined);route.segments=route.segments.map(s=>s.kind==='osm'?{...s,crossing:false}:s);const checked=verifyOfficialReferenceRoute({...base,route});assert.equal(checked.error,undefined);assert.equal(checked.segments.find(s=>s.kind==='osm').crossing,true);
});
