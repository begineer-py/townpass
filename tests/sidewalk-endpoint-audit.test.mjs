import test from 'node:test';import assert from 'node:assert/strict';
import {decimalKey,groupOriginalEndpoints} from '../scripts/sidewalk-endpoint-audit-lib.mjs';
test('decimal identity uses exact values, not token formatting or floating point rounding',()=>{
 assert.equal(decimalKey('0306702.04900'),decimalKey('306702.049'));
 assert.equal(decimalKey('306702049e-3'),decimalKey('306702.049'));
 assert.equal(decimalKey('.306702049e6'),decimalKey('306702.049'));
 assert.notEqual(decimalKey('306702.0490000000001'),decimalKey('306702.049'));
});
test('exact endpoint groups distinguish branches, self closures and nearby coordinates',()=>{
 const parts=[{sourceId:'1',partIndex:0,coordinates:[['306700.00','2771000'],['306701','2771001']]},{sourceId:'2',partIndex:0,coordinates:[['306701.0','2771001.000'],['306702','2771002']]},{sourceId:'3',partIndex:0,coordinates:[['306701.0001','2771001'],['306701.0001','2771001']]}];
 const groups=groupOriginalEndpoints(parts),shared=[...groups.values()].filter(g=>g.length>1);
 assert.equal(shared.length,2);assert.deepEqual(shared[0].map(p=>p.sourceId),['1','2']);assert.deepEqual(shared[1].map(p=>p.end),['start','end']);
});
