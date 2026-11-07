import test from 'node:test';
import assert from 'node:assert/strict';
import {presentRouteCandidates, sortRouteCandidates} from '../src/route-candidates-presentation.mjs';
const route={policyVersion:'p',geometryVerification:'pedestrian-network-v1',construction:{sourceUpdatedAt:'t'}};
const c=(id,score,distanceMetres,r=route)=>({id,score,metrics:{distanceMetres},route:r});
test('sorts valid candidates by score then distance, preserving baseline',()=>{
  assert.deepEqual(presentRouteCandidates({candidates:[c('baseline',5,30),c('b',6,50),c('a',6,20)]},'p','t').map(x=>x.id),['a','b','baseline']);
});
test('rejects unverified or mismatched snapshot and accepts array contract',()=>{
  assert.deepEqual(presentRouteCandidates([c('good',1,10),c('stale',2,10,{...route,construction:{sourceUpdatedAt:'old'}}),c('bad',3,10,{...route,geometryVerification:'unknown'})],'p','t').map(x=>x.id),['good']);
  assert.deepEqual(presentRouteCandidates(null,'p','t'),[]);
});

test('switching sort preserves candidate identities, selected route and input order',()=>{
  const original=[c('baseline',5,30),c('b',6,50),c('a',6,20)];
  const selectedId='b';
  const score=sortRouteCandidates(original,'score');
  const distance=sortRouteCandidates(original,'distance');
  assert.deepEqual(score.map(x=>x.id),['a','b','baseline']);
  assert.deepEqual(distance.map(x=>x.id),['a','baseline','b']);
  assert.strictEqual(score.find(x=>x.id===selectedId),distance.find(x=>x.id===selectedId));
  assert.deepEqual(original.map(x=>x.id),['baseline','b','a']);
});

test('official candidates require verified official provenance and the same construction snapshot',()=>{
  const official={...route,provider:'taipei-official',geometryVerification:'official-polygons-and-crossings-v1'};
  const item={...c('official',70,120,official),metrics:{distanceMetres:120,explicitSidewalkMetres:null,sharedMetres:null},assumptions:['official-attributes-missing-whole-route-penalty']};
  assert.deepEqual(presentRouteCandidates([item],'p','t'),[item]);
  assert.deepEqual(presentRouteCandidates([item],'p','stale'),[]);
  assert.deepEqual(presentRouteCandidates([item],'p',undefined),[]);
  assert.deepEqual(presentRouteCandidates([c('bad',5,10,{...official,provider:'mapped-pedestrian'}),c('bad2',5,10,{...official,geometryVerification:'pedestrian-network-v1'})],'p','t'),[]);
  assert.equal(item.metrics.explicitSidewalkMetres,null);
});
