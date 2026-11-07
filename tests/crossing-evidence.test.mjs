import test from 'node:test';
import assert from 'node:assert/strict';
import {crossingEvidence,crossingUncertainty} from '../src/crossing-evidence.mjs';
import {createRouter,edgeAllowed} from '../src/routing.mjs';
import {createLocalRouteVerifier} from '../src/local-route-verifier.mjs';

const node=i=>[25+i*100/111195,121.5,0,i+1];
const proof=coverage=>({schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:coverage,roadCrossingVerified:true,crossingVerified:true});
const way={osmId:12345,name:'路口',highway:'footway',crossing:true,width:2,slope:0};
const graph=()=>({officialPathEvidence:{schemaVersion:2},nodes:[node(0),node(1),node(2),node(3)],ways:[{...way}],edges:[[0,1,100,0,[],proof(0)],[1,2,100,0,[],proof(.4)],[2,3,100,0,[],proof(1)]],officialAreas:[],officialCrossingAreas:[],roadGeometries:[]});
const exact=(a,b)=>a[0]===b[0]&&a[1]===b[1];
function candidate(g,reverse=false){const a=g.nodes[reverse?3:0].slice(0,2),b=g.nodes[reverse?0:3].slice(0,2);return {a,b,r:createRouter(g)(a,b,{approachAllowed:exact})};}

test('crossing evidence classifies full, partial and none without claiming a zebra',()=>{
 assert.equal(crossingEvidence(way,proof(0)),'none');
 assert.equal(crossingEvidence(way,proof(.4)),'partial');
 assert.equal(crossingEvidence(way,proof(.9999)),'partial');
 assert.equal(crossingEvidence(way,proof(1)),'full');
 assert.equal(crossingEvidence({...way,crossing:false},proof(.4)),null);
 assert.equal(crossingEvidence(way,{}),'none');
 assert.equal(crossingUncertainty(way,proof(1),[node(0),node(1)]),null);
 assert.equal(crossingUncertainty(way,{...proof(.4),derivedFrom:2},[node(0),node(1)]).coverageScope,'source-edge');
});

test('route splits crossing evidence by real edge and reconstructs exact uncertainty geometry',()=>{
 const g=graph(),{a,b,r}=candidate(g);assert.equal(r.error,undefined);
 assert.deepEqual(r.steps.map(s=>s.crossingEvidence),['none','partial','full']);
 assert.deepEqual(r.tierSegments.map(s=>s.crossingEvidence),['none','partial','full']);
 // The verifier must not inherit forged safety labels or omit real geometry.
 r.crossingUncertainties=[];r.steps.forEach(s=>{s.crossing=false;s.crossingEvidence='full';});r.tierSegments=[];
 const out=createLocalRouteVerifier(g)(r,a,b);assert.equal(out.error,undefined);
 assert.deepEqual(out.steps.map(s=>s.crossingEvidence),['none','partial','full']);
 assert.ok(out.steps.every(s=>s.crossing));
 assert.deepEqual(out.crossingUncertainties.map(s=>s.officialCoverage),['none','partial']);
 assert.deepEqual(out.crossingUncertainties[0].coordinates,[g.nodes[0].slice(0,2),g.nodes[1].slice(0,2)]);
 assert.deepEqual(out.crossingUncertainties[1].coordinates,[g.nodes[1].slice(0,2),g.nodes[2].slice(0,2)]);
 assert.ok(out.crossingUncertainties.every(s=>s.osmWayId===12345));
 assert.match(out.crossingUncertainties[1].reason,/部分/);
});

test('reverse traversal keeps edge evidence and geometry in walking order',()=>{
 const g=graph(),{a,b,r}=candidate(g,true),out=createLocalRouteVerifier(g)(r,a,b);
 assert.equal(out.error,undefined);assert.deepEqual(out.steps.map(s=>s.crossingEvidence),['full','partial','none']);
 assert.deepEqual(out.crossingUncertainties[0].coordinates,[g.nodes[2].slice(0,2),g.nodes[1].slice(0,2)]);
 assert.deepEqual(out.crossingUncertainties[1].coordinates,[g.nodes[1].slice(0,2),g.nodes[0].slice(0,2)]);
});

test('no labels relax existing crossing and blocked-edge exclusions',()=>{
 assert.equal(edgeAllowed(way,{},proof(0)),true);
 assert.equal(edgeAllowed({...way,foot:'no'}, {},proof(0)),false);
 assert.equal(edgeAllowed({...way,access:'private'}, {},proof(0)),false);
 assert.equal(edgeAllowed({...way,crossing:'no'}, {},proof(0)),false);
 assert.equal(edgeAllowed(way,{}, {...proof(0),crossingVerified:false}),false);
 assert.equal(edgeAllowed(way,{}, {...proof(0),roadCrossingVerified:false}),false);
 const g=graph();g.nodes[1][2]=1;assert.ok(candidate(g).r.error);
});
