import test from 'node:test';
import assert from 'node:assert/strict';
import {generalSidewalkSegment,generalSidewalkEdge} from '../src/general-sidewalk.mjs';
import {edgeCostFactor} from '../src/route-tiers.mjs';
const official={coverage:1,maxUncoveredMetres:0},osm={coverage:0,maxUncoveredMetres:100};
test('official and OSM sidewalk evidence use the same segment and routing weight',()=>{
 const a={highway:'footway',footway:'sidewalk',width:1.5,slope:0,surface:'asphalt'},b={highway:'footway',width:1.5,slope:0,surface:'asphalt'};
 assert.equal(generalSidewalkEdge(a,osm),true);assert.equal(generalSidewalkEdge(b,official),true);
 assert.equal(edgeCostFactor(a,osm),edgeCostFactor(b,official));
 assert.equal(generalSidewalkSegment({kind:'official-line',officialAreaCovered:true}),true);
 assert.equal(generalSidewalkSegment({kind:'osm',explicitSidewalk:true,officialAreaCovered:true}),true);
});
test('crossings, connectors and shared roads remain separate',()=>{
 for(const segment of [{kind:'osm',crossing:true,officialAreaCovered:true},{kind:'osm',sharedRoad:true,officialAreaCovered:true},{kind:'osm-join',explicitSidewalk:true},{kind:'endpoint-approach'}])assert.equal(generalSidewalkSegment(segment),false);
 assert.equal(generalSidewalkEdge({highway:'footway',footway:'crossing'},official),false);
 assert.equal(generalSidewalkEdge({highway:'footway',footway:'sidewalk'},{...official,connectorVerified:true}),false);
});

test('overlapping source evidence is counted once per segment',()=>{
 const segments=[{kind:'official-line',distanceMetres:10,officialAreaCovered:true},{kind:'osm',distanceMetres:10,explicitSidewalk:true,officialAreaCovered:true},{kind:'osm',distanceMetres:10,officialAreaCovered:true},{kind:'osm',distanceMetres:10,sharedRoad:true,officialAreaCovered:true}];
 assert.equal(segments.filter(generalSidewalkSegment).reduce((sum,s)=>sum+s.distanceMetres,0),30);
});
