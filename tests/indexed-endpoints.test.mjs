import test from 'node:test';
import assert from 'node:assert/strict';
import {createRouter} from '../src/routing.mjs';
const proof={schemaVersion:2,coverage:1,maxUncoveredMetres:0,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
function graph(){
 const nodes=[[25,121.5,0],[25.001,121.5,0],[25.002,121.5,0],[25.001,121.5004,1],[25.004,121.502,0],[25.0005,121.5008,0],[25.003,121.502,0]];
 return {officialPathEvidence:{schemaVersion:2},nodes,ways:[{highway:'footway',width:1.5,slope:0},{highway:'steps'}],edges:[[0,1,111,0,[],proof],[1,2,111,0,[],proof],[5,6,300,1,[],proof]]};
}
function clean(result){const {projectionEpoch,...rest}=result;return rest;}
test('indexed endpoint search matches full scan for exact, near, blocked and distant points',()=>{
 const indexed=createRouter(graph()),linear=createRouter(graph(),{useNodeIndex:false});
 const pairs=[[[25,121.5],[25.002,121.5]],[[25.0002,121.5],[25.0018,121.5]],[[25.001,121.5004],[25.002,121.5]],[[25.004,121.502],[25.002,121.5]],[[25.2,121.7],[25.002,121.5]],[[25.0005,121.5008],[25,121.5]]];
 for(const [start,end] of pairs)assert.deepEqual(clean(indexed(start,end)),clean(linear(start,end)),JSON.stringify({start,end}));
});
test('indexed search stays equivalent through repeated dynamic projections and reset',()=>{
 const a=createRouter(graph()),b=createRouter(graph(),{useNodeIndex:false});let resets=0;
 for(let i=1;i<=150;i++){
  const start=[25+i*.000001,121.5],end=[25.001+i*.000001,121.5];
  assert.deepEqual(clean(a(start,end)),clean(b(start,end)),`projection ${i}`);
  const ar=a.resetProjectionsIfNeeded(),br=b.resetProjectionsIfNeeded();assert.equal(ar,br);if(ar)resets++;
 }
 assert.ok(resets>0);
});

test('invalid coordinates are rejected before spatial index lookup',()=>{
 const router=createRouter(graph());
 for(const start of [[Infinity,121.5],[NaN,121.5],[25,Infinity],null,[]])assert.equal(router(start,[25,121.5]).error,'INVALID_POINTS');
});
