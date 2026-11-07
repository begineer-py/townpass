import test from 'node:test';import assert from 'node:assert/strict';
import {buildShadowGraphs} from '../scripts/sidewalk-shadow-graph.mjs';
test('source shares exact endpoints while shadow breaks at a rejected original segment',()=>{
 const parts=[{coordinates:[['0','0'],['1','0'],['2','0']]},{coordinates:[['2.0','0'],['3','0']]},{coordinates:[['1','0'],['1','1']]}];
 const result=buildShadowGraphs(parts,(a,b,line,seg)=>({area:!(line===0&&seg===1),road:true}));
 assert.equal(result.source.components,2);assert.equal(result.source.edges,3);assert.equal(result.source.totalMetres,4);
 assert.equal(result.shadow.components,3);assert.equal(result.shadow.edges,3);assert.equal(result.shadow.totalMetres,3);assert.equal(result.areaRejected,1);
});
test('exact same-part zero-length vertices retain continuity, rejected crossings do not',()=>{
 const parts=[{coordinates:[['0','0'],['0.0','0'],['1','0'],['2','0']]}];
 const result=buildShadowGraphs(parts,(a,b)=>({area:true,road:b[0]!==2}));
 assert.equal(result.zeroSegments,1);assert.equal(result.shadow.components,1);assert.equal(result.shadow.totalMetres,1);assert.equal(result.roadRejected,1);
});
