import test from 'node:test';
import assert from 'node:assert/strict';
import proj4 from 'proj4';
import {selectReferenceRegion} from '../src/reference-region.mjs';
const twd='+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs';
test('bounded selection retains a complete crossing source part and a curved graph edge',()=>{
 const start=[25.04,121.5],end=[25.041,121.501],[x,y]=proj4('EPSG:4326',twd,[start[1],start[0]]);
 const crossing={qgsFid:'1',partIndex:0,bounds:[x-2000,y-1,x+2000,y+1],coordinates:[[x-2000,y],[x+2000,y]]};
 const far={qgsFid:'2',partIndex:0,bounds:[x+10000,y,x+10001,y+1],coordinates:[[x+10000,y],[x+10001,y+1]]};
 const asset={schemaVersion:1,source:'official-passageway',sourceHash:'a'.repeat(64),crs:'EPSG:3826',parts:[crossing,far]};
 const graph={nodes:[[25.04,121.46],[25.04,121.54],[25.09,121.5],[25.10,121.5]],edges:[[0,1,1,0,[[25.04,121.5]]],[2,3,1,0,[]]]};
 const region=selectReferenceRegion(asset,graph,start,end);
 assert.deepEqual(region.parts,[crossing]);assert.deepEqual(region.osmEdgeIds,[0]);assert.equal(region.scope,'bounded-area');
 assert.throws(()=>selectReferenceRegion({...asset,sourceHash:'bad'},graph,start,end),/INVALID_REFERENCE_INPUT/);
});

import {createRouter} from '../src/routing.mjs';
test('indexed selection matches full scan for curves, excluded edges, boundaries and projection growth',()=>{
 const proof={schemaVersion:2,coverage:1,maxUncoveredMetres:0,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
 const graph={officialPathEvidence:{schemaVersion:2},nodes:[[25.04,121.46,0],[25.04,121.54,0],[25.039,121.5,0],[25.041,121.5,0],[25.09,121.5,0],[25.10,121.5,0],[25.04,121.51,0]],ways:[{highway:'footway',width:1.5,slope:0},{highway:'steps'}],edges:[[0,1,8000,0,[[25.04,121.5]],proof],[2,3,222,1,[],proof],[4,5,1000,0,[],proof],[3,6,1000,1,[[NaN,121.5]],proof]]};
 const asset={schemaVersion:1,source:'official-passageway',sourceHash:'a'.repeat(64),crs:'EPSG:3826',parts:[]},router=createRouter(graph);
 for(const [start,end,margin] of [[[25.04,121.5],[25.041,121.501],0],[[25.04,121.5],[25.041,121.501],250],[[25.04,121.5],[25.05,121.52],1000],[[25.2,121.6],[25.2,121.6],0]]){
  const expected=selectReferenceRegion(asset,graph,start,end,margin),actual=selectReferenceRegion(asset,graph,start,end,margin,router.referenceEdgeCandidates);
  assert.deepEqual(actual.osmEdgeIds,expected.osmEdgeIds);
 }
 graph.nodes.push([25.04,121.5,0]);graph.edges.push([0,7,1,0,[],{...proof,derivedFrom:0}]);
 assert.deepEqual(selectReferenceRegion(asset,graph,[25.04,121.5],[25.041,121.501],0).osmEdgeIds,[0,1]);
 // The index refuses externally changed graph arrays rather than silently dropping data.
 assert.throws(()=>selectReferenceRegion(asset,graph,[25.04,121.5],[25.041,121.501],0,router.referenceEdgeCandidates),/Router graph was replaced/);
});
test('large region falls back to the complete scan',()=>{
 const graph={officialPathEvidence:{schemaVersion:2},nodes:[[25,121.5],[25.001,121.501]],ways:[{highway:'steps'}],edges:[[0,1,1,0,[],{}]]},router=createRouter(graph);
 assert.equal(router.referenceEdgeCandidates([121.4,24.9,121.8,25.3]),null);
});
