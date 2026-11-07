import test from 'node:test';
import assert from 'node:assert/strict';
import {referenceRouteLines,referenceRouteDistance,referenceMetric,REFERENCE_NOTICE,REFERENCE_STYLES} from '../src/reference-route-presentation.mjs';
import {findProvisionalRoute} from '../src/provisional-network.mjs';
import {verifyOfficialReferenceRoute} from '../src/official-reference-validator.mjs';
import {createLocalRouteVerifier} from '../src/local-route-verifier.mjs';
import proj4 from 'proj4';
const A=[25,121.5],B=[25.0001,121.5],C=[25.000105,121.500002],D=[25.0003,121.5001];
const route={kind:'official-passageway',verification:'official-source-screened-v1',navigationAllowed:true,distanceMetres:123,segments:[{kind:'endpoint-approach',side:'start',coordinates:[A,A]},{kind:'official-line',coordinates:[A,B]},{kind:'osm-join',coordinates:[B,C]},{kind:'osm',coordinates:[C,D]},{kind:'endpoint-approach',side:'end',coordinates:[D,D]}]};
test('draws screened source lines, estimated connectors, and OSM bends distinctly',()=>{
 assert.deepEqual(referenceRouteLines(route,{start:A,end:D}).map(x=>x.kind),['join','sidewalk','join','pedestrian','join']);
 assert.equal(referenceRouteDistance(route),'123 公尺');assert.match(REFERENCE_NOTICE,/路側、銜接與樓層未確認/);assert.notEqual(REFERENCE_STYLES.sidewalk.dashArray,REFERENCE_STYLES.join.dashArray);
 assert.equal(referenceMetric(null),'未提供');assert.equal(referenceMetric(0),'0 公尺');
});
test('refuses unscreened, disconnected, malformed or wrong-endpoint geometry',()=>{
 assert.deepEqual(referenceRouteLines({...route,navigationAllowed:false},{start:A,end:D}),[]);
 assert.deepEqual(referenceRouteLines({...route,verification:'pending-source-validation'},{start:A,end:D}),[]);
 assert.deepEqual(referenceRouteLines(route,{start:B,end:D}),[]);
 const bad=structuredClone(route);bad.segments[2].coordinates=[A,C];assert.deepEqual(referenceRouteLines(bad,{start:A,end:D}),[]);
 const malformed=structuredClone(route);malformed.segments[1].coordinates=[A,[NaN,121.5]];assert.deepEqual(referenceRouteLines(malformed,{start:A,end:D}),[]);
 const excessive=structuredClone(route);excessive.segments[2].coordinates=[B,D];excessive.segments[3].coordinates=[D,D];assert.deepEqual(referenceRouteLines(excessive,{start:A,end:D}),[]);
});
test('reverse direction keeps OSM bends and the short connector separate',()=>{
 const reverse={...route,segments:[{kind:'endpoint-approach',side:'start',coordinates:[D,D]},{kind:'osm',coordinates:[D,C]},{kind:'osm-join',coordinates:[C,B]},{kind:'official-line',coordinates:[B,A]},{kind:'endpoint-approach',side:'end',coordinates:[A,A]}]};
 assert.deepEqual(referenceRouteLines(reverse,{start:D,end:A}),[{kind:'join',coordinates:[D,D]},{kind:'pedestrian',coordinates:[D,C]},{kind:'join',coordinates:[C,B]},{kind:'sidewalk',coordinates:[B,A]},{kind:'join',coordinates:[A,A]}]);
});
test('screened core output displays the same source geometry in both directions',()=>{
 const twd='+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs';
 const ll=p=>{const [lon,lat]=proj4(twd,'EPSG:4326',p);return [lat,lon];};
 const a=[303000,2778000],b=[303100,2778000],c=[303101,2778000],d=[303201,2778000],t=new Date().toISOString();
 const parts=[{qgsFid:'1',partIndex:0,coordinates:[a,b]},{qgsFid:'2',partIndex:0,coordinates:[c,d]}];
 const area={type:'Polygon',coordinates:[[[121.52,25.10],[121.54,25.10],[121.54,25.12],[121.52,25.12],[121.52,25.10]]]};
 const graph={officialPathEvidence:{schemaVersion:2},officialAreas:[area],officialCrossingAreas:[],roadGeometries:[[[121.79,25],[121.79,25.01]]],nodes:[],ways:[],edges:[]};
 const deps={parts,graph,snapshot:{schemaVersion:1,fetchedAt:t,sourceUpdatedAt:t,works:[]},sourceHash:'a'.repeat(64),verifyLocal:createLocalRouteVerifier(graph,[],[]),facilities:[],places:[],osmEdgeIds:[],options:{}};
 for(const [start,end] of [[ll(a),ll(d)],[ll(d),ll(a)]]){
  const provisional=findProvisionalRoute({...deps,start,end}),screened=verifyOfficialReferenceRoute({...deps,route:provisional,start,end});
  assert.equal(screened.error,undefined);assert.ok(referenceRouteLines(screened,{start,end}).length>=3);
 }
});

test('separates shared streets from mapped sidewalks in either direction',()=>{
 for(const [flags,expected] of [[{crossing:true},'crossing'],[{sharedRoad:true},'shared'],[{explicitSidewalk:true},'sidewalk'],[{},'pedestrian']]){
  const candidate=structuredClone(route);Object.assign(candidate.segments[3],flags);
  assert.equal(referenceRouteLines(candidate,{start:A,end:D})[3].kind,expected);
  const reverse={...candidate,segments:[{kind:'endpoint-approach',side:'start',coordinates:[D,D]},{...candidate.segments[3],coordinates:[D,C]},{kind:'osm-join',coordinates:[C,B]},{kind:'official-line',coordinates:[B,A]},{kind:'endpoint-approach',side:'end',coordinates:[A,A]}]};
  assert.equal(referenceRouteLines(reverse,{start:D,end:A})[1].kind,expected);
 }
 assert.notEqual(REFERENCE_STYLES.shared.dashArray,REFERENCE_STYLES.sidewalk.dashArray);
});

test('approximate source crossing displays a crossing and carries its uncertainty',()=>{
 const candidate=structuredClone(route);candidate.segments[1].crossing=true;candidate.segments[1].approximateCrossing=true;
 const lines=referenceRouteLines(candidate,{start:A,end:D});assert.equal(lines[1].kind,'crossing');assert.equal(lines[1].approximateCrossing,true);
});
