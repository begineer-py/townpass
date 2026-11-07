import test from 'node:test';
import assert from 'node:assert/strict';
import {createRouter} from '../src/routing.mjs';
import {createLocalRouteVerifier} from '../src/local-route-verifier.mjs';
import {createConstructionChecker} from '../src/construction.mjs';
import {createNearbyRoutes} from '../src/nearby-routes.mjs';

const a=[25,121.5],b=[25,121.501],p=[25+30/111195,121.501];
const proof={schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
const graph=()=>({officialPathEvidence:{schemaVersion:2},officialAreas:[],officialCrossingAreas:[],roadGeometries:[[[121.51,25],[121.51,25.01]]],nodes:[[...a,0,1],[...b,0,2]],ways:[{name:'人行道',highway:'footway',width:2,slope:0}],edges:[[0,1,100,0,[],proof]]});
const snapshot=works=>{const stamp=new Date().toISOString();return {schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works};};
const poi={id:'poi',name:'二樓地點',kind:'place',lat:p[0],lon:p[1],level:'1'};
const other={id:'station',name:'起點',lat:a[0],lon:a[1]};
function setup(works=[]){const g=graph(),snap=snapshot(works),router=createRouter(g),verifyLocal=createLocalRouteVerifier(g,[],[poi]),checker=createConstructionChecker(snap),find=createNearbyRoutes(g,{router,verifyLocal,facilities:[]});return {g,snap,checker,find};}

test('returns independently verified pedestrian points on either side without a line to the original',()=>{
 for(const side of ['start','end']){
  const {snap,checker,find}=setup(),result=side==='start'?find(poi,other,{},snap,checker):find(other,poi,{},snap,checker);
  const c=result.candidates.find(c=>c.side===side);assert.ok(c);assert.equal(c.point.name,'附近人行路網位置');
  assert.ok(c.straightMetres>=29&&c.straightMetres<=31);assert.deepEqual([c.point.lat,c.point.lon],b);
  assert.ok(!('coordinates' in c));assert.notDeepEqual([c.point.lat,c.point.lon],[poi.lat,poi.lon]);
 }
});
test('closed routes are not offered and stale construction is rejected',()=>{
 const now=new Date(),taipei=new Date(now.getTime()+8*3600000),day=`${taipei.getUTCFullYear()-1911}/${taipei.getUTCMonth()+1}/${taipei.getUTCDate()}`;
 const work={id:'close',address:'封閉',start:day,end:day,hours:'24小時施工',impact:'blocked',geometries:[{type:'Point',coordinates:[[25,121.5005]]}]};
 const {snap,checker,find}=setup([work]);assert.equal(find(other,poi,{},snap,checker).candidates.length,0);
 const stale={...snap,sourceUpdatedAt:'2020-01-01T00:00:00Z'};assert.equal(find(other,poi,{},stale,checker).error,'CONSTRUCTION_UNAVAILABLE');
});
test('when neither original endpoint is reachable the one-sided search makes no claim of an entrance',()=>{
 const g=graph(),second={id:'second',name:'另一處二樓',kind:'place',lat:25+20/111195,lon:121.5,level:'1'},snap=snapshot([]);
 const router=createRouter(g),verifyLocal=createLocalRouteVerifier(g,[],[poi,second]),checker=createConstructionChecker(snap),find=createNearbyRoutes(g,{router,verifyLocal,facilities:[]});
 const result=find(second,poi,{},snap,checker);assert.equal(result.error,undefined);assert.deepEqual(result.candidates,[]);
});
