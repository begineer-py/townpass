import test from 'node:test';
import assert from 'node:assert/strict';
import {DISTANCES,TYPES,sampleMixed} from '../scripts/benchmark-mixed-places.mjs';

test('mixed sampling is seeded, stratified, bidirectional, and does not filter unknown accessibility',()=>{
 const stations=[{id:'station',name:'測試站(R01)',kind:'20',lat:25,lon:121.5,address:'臺北市'}];
 const distances=[700,1500,3000,6000],places=[];
 for(const type of TYPES)for(const d of distances)for(let i=0;i<2;i++)places.push({id:`${type}-${d}-${i}`,name:`${type} ${d} ${i}`,kind:type,lat:25+d/111195,lon:121.5,sourceId:'osm',wheelchair:'no'});
 const first=sampleMixed(stations,places,[],{seed:41}),again=sampleMixed(stations,places,[],{seed:41});
 assert.deepEqual(first,again);assert.equal(first.cases.length,40);
 for(const bin of DISTANCES)for(const type of TYPES){const rows=first.cases.filter(r=>r.bin===bin.label&&r.type===type);assert.equal(rows.length,2);assert.notEqual(rows[0].start.kind,rows[1].start.kind);assert.ok(rows.every(r=>r.straightMetres>=bin.min&&r.straightMetres<bin.max));}
 assert.ok(first.cases.every(c=>(c.start.kind==='20'?c.end:c.start).wheelchair==='no'));
 assert.equal(new Set(first.cases.map(c=>(c.start.kind==='20'?c.end:c.start).id)).size,40);
 assert.equal(new Set(first.cases.map(c=>[c.start.id,c.end.id].sort().join(':'))).size,40);
 assert.throws(()=>sampleMixed(stations,places,[],{seed:-1}),/Invalid seed/);
});
