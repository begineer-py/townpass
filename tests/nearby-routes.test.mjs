import test from 'node:test';
import assert from 'node:assert/strict';
import {createRouter} from '../src/routing.mjs';
import {createLocalRouteVerifier} from '../src/local-route-verifier.mjs';
import {planPlaces} from '../src/local-route-verifier.mjs';
import {createConstructionChecker} from '../src/construction.mjs';
import {createNearbyRoutes, verifyNearbyRoutes} from '../src/nearby-routes.mjs';
import {nearbyReplacement, nearbyWarnings} from '../src/nearby-presentation.mjs';

const a=[25,121.5],b=[25,121.501],p=[25+30/111195,121.501];
const proof={schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
const graph=()=>({officialPathEvidence:{schemaVersion:2},officialAreas:[],officialCrossingAreas:[],roadGeometries:[[[121.51,25],[121.51,25.01]]],nodes:[[...a,0,1],[...b,0,2]],ways:[{name:'人行道',highway:'footway',width:2,slope:0}],edges:[[0,1,100,0,[],proof]]});
const snapshot=works=>{const stamp=new Date().toISOString();return {schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works};};
const poi={id:'poi',name:'二樓地點',kind:'place',lat:p[0],lon:p[1],level:'1'};
const other={id:'station',name:'起點',lat:a[0],lon:a[1]};
function setup(works=[]){const g=graph(),snap=snapshot(works),router=createRouter(g),verifyLocal=createLocalRouteVerifier(g,[],[poi]),checker=createConstructionChecker(snap),find=createNearbyRoutes(g,{router,verifyLocal,facilities:[]});return {g,snap,checker,find,router,verifyLocal};}

test('returns independent unverified pedestrian points on either side without a line to the original',()=>{
 for(const side of ['start','end']){
  const {snap,checker,find}=setup(),result=side==='start'?find(poi,other,{},snap,checker):find(other,poi,{},snap,checker);
  const c=result.candidates.find(c=>c.side===side);assert.ok(c);assert.equal(c.point.name,'附近人行路網位置');
  assert.ok(c.straightMetres>=29&&c.straightMetres<=31);assert.deepEqual([c.point.lat,c.point.lon],b);
  assert.equal(c.routeVerified,false);assert.equal(c.routeDistance,null);assert.equal(c.searchRadius,50);
  assert.ok(!('coordinates' in c));assert.notDeepEqual([c.point.lat,c.point.lon],[poi.lat,poi.lon]);
 }
});
test('closed routes are not offered and stale construction is rejected',()=>{
 const now=new Date(),taipei=new Date(now.getTime()+8*3600000),day=`${taipei.getUTCFullYear()-1911}/${taipei.getUTCMonth()+1}/${taipei.getUTCDate()}`;
 const work={id:'close',address:'封閉',start:day,end:day,hours:'24小時施工',impact:'blocked',geometries:[{type:'Point',coordinates:[p]}]};
 const {snap,checker,find}=setup([work]);assert.equal(find(other,poi,{},snap,checker).candidates.length,0);
 const stale={...snap,sourceUpdatedAt:'2020-01-01T00:00:00Z'};assert.equal(find(other,poi,{},stale,checker).error,'CONSTRUCTION_UNAVAILABLE');
});
test('both original endpoints can independently offer unverified candidates',()=>{
 const g=graph(),second={id:'second',name:'另一處二樓',kind:'place',lat:25+20/111195,lon:121.5,level:'1'},snap=snapshot([]);
 const router=createRouter(g),verifyLocal=createLocalRouteVerifier(g,[],[poi,second]),checker=createConstructionChecker(snap),find=createNearbyRoutes(g,{router,verifyLocal,facilities:[]});
 const result=find(second,poi,{},snap,checker);assert.equal(result.error,undefined);
 for(const side of ['start','end']){const choices=result.candidates.filter(c=>c.side===side);assert.ok(choices.length);assert.ok(choices.every(c=>c.routeVerified===false&&c.routeDistance===null));}
 const verified=verifyNearbyRoutes(result,second,poi,{},snap,{router,verifyLocal,facilities:[],checker});
 assert.ok(verified.candidates.length);
 for (const candidate of verified.candidates) {
  assert.ok(candidate.start && candidate.end);
  assert.equal(candidate.route.geometryVerification,'pedestrian-network-v1');
  assert.deepEqual(candidate.route.coordinates[0],[candidate.start.point.lat,candidate.start.point.lon]);
  assert.deepEqual(candidate.route.coordinates.at(-1),[candidate.end.point.lat,candidate.end.point.lon]);
 }
});
test('searches 50m first and widens only when inner candidates are unavailable',()=>{
 const {snap,checker,find}=setup();const inner=find(other,poi,{},snap,checker).candidates.filter(c=>c.side==='end');assert.ok(inner.length);assert.ok(inner.every(c=>c.searchRadius===50&&c.straightMetres<=50));
 const far={...poi,lat:25+65/111195},outer=find(other,far,{},snap,checker).candidates.filter(c=>c.side==='end');assert.ok(outer.length);assert.ok(outer.every(c=>c.searchRadius===80&&c.straightMetres>50));
});
test('finds a nearby interior point even when both mapped segment nodes are farther away',()=>{
 const {snap,checker,find,router,verifyLocal}=setup(),middle={...poi,lat:25+5/111195,lon:(a[1]+b[1])/2};
 const c=find(other,middle,{},snap,checker).candidates.find(x=>x.side==='end');
 assert.ok(c);assert.equal(c.searchRadius,50);assert.ok(c.straightMetres>=4&&c.straightMetres<=6);
 assert.ok(Math.abs(c.point.lon-middle.lon)<1e-9);
 const route=planPlaces(other,c.point,{},snap,{router,verifyLocal,facilities:[],checker});
 assert.equal(route.error,undefined);assert.deepEqual(route.coordinates.at(-1),[c.point.lat,c.point.lon]);assert.notDeepEqual(route.coordinates.at(-1),[middle.lat,middle.lon]);
});
test('if a segment projection crosses a road, its real endpoint can still be considered',()=>{
 const g=graph(),mid=121.5005,source={...poi,lat:25+20/111195,lon:mid},snap=snapshot([]);
 g.roadGeometries=[[[121.5+40/100700,25+10/111195],[121.5+60/100700,25+10/111195]]];
 const router=createRouter(g),verifyLocal=createLocalRouteVerifier(g,[],[source]),checker=createConstructionChecker(snap),find=createNearbyRoutes(g,{router,verifyLocal,facilities:[]});
 const choices=find(other,source,{},snap,checker).candidates.filter(c=>c.side==='end');
 assert.ok(choices.length);assert.ok(choices.every(c=>c.searchRadius===80&&c.straightMetres>50));
});
test('a vehicle crossing or closer blocked node prevents the detached point candidate',()=>{
 const g=graph();g.roadGeometries=[[[121.499,25+15/111195],[121.502,25+15/111195]]];const snap=snapshot([]),router=createRouter(g),verifyLocal=createLocalRouteVerifier(g,[],[poi]),checker=createConstructionChecker(snap),find=createNearbyRoutes(g,{router,verifyLocal,facilities:[]});
 assert.equal(find(other,poi,{},snap,checker).candidates.filter(c=>c.side==='end').length,0);
 const g2=graph();g2.nodes.push([25+20/111195,121.501,1,3]);const r2=createRouter(g2),v2=createLocalRouteVerifier(g2,[],[poi]),find2=createNearbyRoutes(g2,{router:r2,verifyLocal:v2,facilities:[]});
 assert.equal(find2(other,poi,{},snap,checker).candidates.filter(c=>c.side==='end').length,0);
});

test('nearby search includes eligible shared streets while preserving road and construction checks',()=>{
 const g=graph(),snap=snapshot([]),shared={...proof,sharedRoad:true,sourceTopologyVerified:true,junctionsVerified:true,roadIntersectionsVerified:true,barriersVerified:true};
 g.ways=[{name:'共行路',highway:'residential',source:'osm-shared-street'}];g.edges[0][5]=shared;
 const router=createRouter(g),verifyLocal=createLocalRouteVerifier(g),checker=createConstructionChecker(snap),find=createNearbyRoutes(g,{router,verifyLocal,facilities:[]});
 const original={id:'point-1',name:'地圖選點',originKind:'map',lat:p[0],lon:p[1]};
 const candidate=find(other,original,{},snap,checker).candidates.find(c=>c.side==='end');
 assert.ok(candidate);assert.equal(candidate.point.nearbyNetwork,'shared');assert.match(candidate.point.name,/人車共行/);
 const replacement=nearbyReplacement(candidate,original);assert.match(replacement.name,/人車共行/);assert.match(nearbyWarnings(other,replacement)[0],/人車共行/);
 assert.equal(find(other,original,{officialOnly:true},snap,checker).candidates.length,0);
 assert.equal(find(other,original,{},snap,{allowed:()=>false}).candidates.length,0);
 g.roadGeometries=[[[121.499,25+15/111195],[121.502,25+15/111195]]];
 const blockedFind=createNearbyRoutes(g,{router,verifyLocal,facilities:[]});
 assert.equal(blockedFind(other,original,{},snap,checker).candidates.filter(c=>c.side==='end').length,0);
});
test('projection capacity preserves already verified nearby route without inventing original connections',()=>{
 const snap=snapshot([]),limit=Object.assign(new Error('limit'),{code:'PROJECTION_LIMIT'}),candidates=[
  {side:'start',point:{id:'x',lat:a[0],lon:a[1]},straightMetres:30},
  {side:'start',point:{id:'y',lat:b[0],lon:b[1]},straightMetres:40},
 ];
 let calls=0;const verifyLocal=r=>r;verifyLocal.approachAllowed=()=>true;
 const deps={facilities:[],verifyLocal,checker:{allowed:()=>true,inspect:()=>({blocked:[]})},router:(from,to)=>{if(++calls>1)throw limit;return {distance:100,weightedCost:100,coordinates:[from,to],geometryVerification:'pedestrian-network-v1'};}};
 const result=verifyNearbyRoutes({candidates,truncated:false},poi,other,{},snap,deps);
 assert.equal(result.candidates.length,1);assert.equal(result.truncated,true);assert.equal(result.searchStatus,'projection-limit');
 assert.deepEqual(result.candidates[0].route.coordinates[0],[a[0],a[1]]);assert.notDeepEqual(result.candidates[0].route.coordinates[0],[poi.lat,poi.lon]);
 calls=1;assert.throws(()=>verifyNearbyRoutes({candidates},poi,other,{},snap,deps),error=>error===limit);
 calls=0;deps.router=(from,to)=>{if(++calls>1){snap.sourceUpdatedAt='2000-01-01T00:00:00Z';throw limit;}return {distance:100,weightedCost:100,coordinates:[from,to]};};
 assert.equal(verifyNearbyRoutes({candidates},poi,other,{},snap,deps).error,'CONSTRUCTION_UNAVAILABLE');
});
