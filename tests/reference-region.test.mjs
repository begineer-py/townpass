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
