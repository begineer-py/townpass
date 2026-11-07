import test from 'node:test';
import assert from 'node:assert/strict';
import {createNearbySearch,shouldAutoSearchNearby} from '../src/nearby-search.mjs';
import {nearbyReplacement,nearbyWarnings} from '../src/nearby-presentation.mjs';

const fresh=()=>{const t=new Date().toISOString();return {schemaVersion:1,fetchedAt:t,sourceUpdatedAt:t,works:[]};};
const args={startPlace:{lat:25,lon:121.5},endPlace:{lat:25.01,lon:121.51},options:{},url:'https://example.test/graph',online:true};
function fakeWorker(){return {sent:[],terminated:false,postMessage(x){this.sent.push(x);},terminate(){this.terminated=true;}};}

test('automatic recovery only starts after a completed eligible route failure',()=>{
 const ready={error:'NO_CONNECTION',routing:false,graphReady:true,tab:'plan',start:{lat:25,lon:121.5},end:{lat:25.01,lon:121.51}};
 for(const error of ['NO_CONNECTION','NO_ROUTE','OFFICIAL_ENTRY_UNVERIFIED','OFFICIAL_CROSSING_UNVERIFIED','CONSTRUCTION_BLOCKED'])assert.equal(shouldAutoSearchNearby({...ready,error}),true,error);
 for(const patch of [{routing:true},{graphReady:false},{tab:'saved'},{start:null},{end:null},{error:''},{error:'CONSTRUCTION_UNAVAILABLE'},{error:'UNVERIFIED_NETWORK'},{error:'OFFICIAL_OUTSIDE_COVERAGE'}])assert.equal(shouldAutoSearchNearby({...ready,...patch}),false,JSON.stringify(patch));
});

test('cancel aborts construction fetch and ignores a late result',async()=>{
 let finishFetch,signal,created=0;const states=[];
 const search=createNearbySearch({fetchSnapshot:s=>{signal=s;return new Promise(resolve=>{finishFetch=resolve;});},createWorker:()=>{created++;return fakeWorker();},onState:s=>states.push(s)});
 const task=search.start(args);assert.equal(states.at(-1).status,'loading');search.cancel();assert.equal(signal.aborted,true);finishFetch(fresh());await task;
 assert.equal(created,0);assert.equal(states.at(-1).status,'idle');
});
test('cancellation terminates worker and late reply cannot restore candidates',async()=>{
 const w=fakeWorker(),states=[],search=createNearbySearch({fetchSnapshot:async()=>fresh(),createWorker:()=>w,onState:s=>states.push(s)});
 await search.start(args);w.onmessage({data:{type:'ready'}});const id=w.sent.at(-1).id,late=w.onmessage;
 search.cancel();assert.equal(w.terminated,true);late({data:{type:'nearby-positions',id,result:{candidates:[{side:'end'}]}}});
 assert.equal(states.at(-1).status,'idle');assert.deepEqual(states.at(-1).candidates,[]);
});
test('wrong request id is ignored and expired construction cannot publish a result',async()=>{
 const snapshot=fresh(),w=fakeWorker(),states=[],search=createNearbySearch({fetchSnapshot:async()=>snapshot,createWorker:()=>w,onState:s=>states.push(s)});
 await search.start(args);w.onmessage({data:{type:'ready'}});const id=w.sent.at(-1).id;
 w.onmessage({data:{type:'nearby-positions',id:id+1,result:{candidates:[{}]}}});assert.equal(states.at(-1).status,'loading');
 snapshot.sourceUpdatedAt='2020-01-01T00:00:00Z';w.onmessage({data:{type:'nearby-positions',id,result:{candidates:[{}]}}});
 assert.equal(states.at(-1).status,'error');assert.deepEqual(states.at(-1).candidates,[]);assert.equal(w.terminated,true);
});
test('publishes verified route alternatives alongside legacy unverified positions',async()=>{
 const snapshot=fresh(),w=fakeWorker(),states=[],search=createNearbySearch({fetchSnapshot:async()=>snapshot,createWorker:()=>w,onState:s=>states.push(s)});
 await search.start(args);w.onmessage({data:{type:'ready'}});const id=w.sent.at(-1).id;
 const candidates=[{side:'end',point:{lat:25.01,lon:121.5},routeVerified:false}];
 const verifiedCandidates=[{end:candidates[0],route:{geometryVerification:'pedestrian-network-v1',construction:{sourceUpdatedAt:snapshot.sourceUpdatedAt}}}];
 w.onmessage({data:{type:'nearby-positions',id,result:{candidates,verifiedCandidates,truncated:false}}});
 assert.equal(states.at(-1).status,'ready');assert.deepEqual(states.at(-1).candidates,candidates);assert.deepEqual(states.at(-1).verifiedCandidates,verifiedCandidates);
 assert.deepEqual(states.at(-1).startPlace,args.startPlace);assert.deepEqual(states.at(-1).endPlace,args.endPlace);assert.equal(states.at(-1).constructionSourceUpdatedAt,snapshot.sourceUpdatedAt);assert.equal(w.terminated,true);
});
test('replacement retains original place and labels its actual current side after swapping',()=>{
 const original={name:'二樓診所',lat:25,lon:121.5},first=nearbyReplacement({side:'end',point:{lat:25.0001,lon:121.5}},original);
 assert.equal(first.nearbyOriginal.name,'二樓診所');assert.deepEqual(first.nearbyOriginal.coordinates,[25,121.5]);
 assert.match(nearbyWarnings(null,first)[0],/目的地.*尚未抵達原地點.*樓層未確認/);
 assert.match(nearbyWarnings(first,null)[0],/起點.*不從原地點出發.*樓層未確認/);
 const second=nearbyReplacement({side:'end',point:{lat:25.0002,lon:121.5}},first);
 assert.equal(second.nearbyOriginal.name,'二樓診所');assert.equal(second.nearbyOriginal.straightMetres,22);
});
