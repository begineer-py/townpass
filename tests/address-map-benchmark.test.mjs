import test from 'node:test';
import assert from 'node:assert/strict';
import {BINS,sampleAddressMap} from '../scripts/benchmark-address-map.mjs';

test('address/map sample is reproducible, stratified, bidirectional and never prefilters by connectivity',()=>{
 const stations=[{id:'station',name:'測試站(R01)',kind:'20',lat:25,lon:121.5,address:'臺北市'}],records=[];
 for(const d of [750,1500,3000,6000])for(let i=0;i<48;i++)records.push({key:`${d}-${i}`,name:`測試街${d}-${i}號`,file:'fixture',lat:25+d/111195,lon:121.5+i/10070000,access:'no'});
 const first=sampleAddressMap(stations,records,{seed:123}),again=sampleAddressMap(stations,records,{seed:123});assert.deepEqual(first,again);assert.equal(first.cases.length,48);
 for(const bin of BINS)for(const kind of ['address','map']){
  const a=first.cases.filter(c=>c.bin===bin.label&&c.kind===kind);assert.equal(a.length,6);assert.equal(a.filter(c=>c.selectedSide==='start').length,3);assert.equal(a.filter(c=>c.selectedSide==='end').length,3);
  assert.ok(a.every(c=>c.straightMetres>=bin.min&&c.straightMetres<bin.max));
 }
 assert.equal(new Set(first.cases.map(c=>`${c.reference.name}:${c.reference.coordinate}`)).size,48);
 for(const c of first.cases){const selected=c.selectedSide==='start'?c.start:c.end;assert.equal(selected.selectionKind,'user');if(c.kind==='map'){assert.equal(selected.originKind,'map');assert.ok(c.mapOffsetMetres>=15&&c.mapOffsetMetres<=80);}else assert.equal(selected.sourceId,'osm');}
 assert.throws(()=>sampleAddressMap(stations,records,{seed:-1}),/Invalid seed/);
});
