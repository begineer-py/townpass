import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveFollow} from '../src/live-follow.mjs';
import {createLiveFollowSearch} from '../src/live-follow-search.mjs';
import {watchLocation} from '../src/location.js';

test('simulated GPS deviation reaches the real worker and yields a labelled estimated approach',async t=>{
 const a=[25,121.5],b=[25,121.501],proof={schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
 const area={type:'Polygon',coordinates:[[[121.51,25],[121.511,25],[121.511,25.001],[121.51,25.001],[121.51,25]]]};
 const graph={officialPathEvidence:{schemaVersion:2},officialAreas:[area],officialCrossingAreas:[],roadGeometries:[[[121.51,25],[121.51,25.01]]],nodes:[[...a,0,1],[...b,0,2]],ways:[{name:'人行路',highway:'footway',width:2,slope:0}],edges:[[0,1,100,0,[],proof]]};
 const old={fetch:globalThis.fetch,self:globalThis.self,postMessage:globalThis.postMessage,window:globalThis.window,navigator:Object.getOwnPropertyDescriptor(globalThis,'navigator')};
 let clock=Date.now(),emit,cleared=false,worker,resolveResult;
 const completed=new Promise(resolve=>{resolveResult=resolve;});
 t.after(()=>{globalThis.fetch=old.fetch;globalThis.self=old.self;globalThis.postMessage=old.postMessage;globalThis.window=old.window;if(old.navigator)Object.defineProperty(globalThis,'navigator',old.navigator);else delete globalThis.navigator;});
 globalThis.window={};Object.defineProperty(globalThis,'navigator',{configurable:true,value:{geolocation:{watchPosition(fn){emit=fn;return 5;},clearWatch(){cleared=true;}}}});
 globalThis.fetch=async url=>({ok:true,arrayBuffer:async()=>new TextEncoder().encode(JSON.stringify(/facilities|places/.test(String(url))?[]:graph)).buffer});
 globalThis.self={};globalThis.postMessage=message=>{if(!worker?.terminated)queueMicrotask(()=>worker.onmessage?.({data:message}));};
 await import('../src/route-worker.js?live-follow-integration');
 const snapshot={schemaVersion:1,fetchedAt:new Date(clock).toISOString(),sourceUpdatedAt:new Date(clock).toISOString(),works:[]};
 const search=createLiveFollowSearch({now:()=>clock,fetchSnapshot:async()=>snapshot,onState:s=>{if(s.status==='ready'||s.status==='error')resolveResult(s);},createWorker:()=>{
  worker={terminated:false,postMessage(data){queueMicrotask(()=>{if(!this.terminated)void self.onmessage({data});});},terminate(){this.terminated=true;}};return worker;
 }});
 const follow=createLiveFollow({coordinates:[a,b],now:()=>clock,onReplan:p=>void search.start({startPlace:p,endPlace:{lat:b[0],lon:b[1]},options:{},url:'https://example.test/graph.json',online:true})});
 const stop=watchLocation(p=>follow.sample(p),e=>resolveResult({status:'error',error:e}));
 const pos=()=>({coords:{latitude:25+6/111195,longitude:121.5,accuracy:3},timestamp:clock});
 emit(pos());clock+=1000;emit(pos());
 const result=await completed;stop();follow.stop();search.cancel();
 assert.equal(result.status,'ready');assert.equal(cleared,true);assert.equal(result.route.error,undefined);
 assert.equal(result.route.approaches[0].estimated,true);assert.equal(result.route.approaches[0].unconfirmed,true);assert.equal(result.route.approaches[0].originKind,'gps');
});
