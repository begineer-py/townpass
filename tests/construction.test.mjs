import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeConstruction,constructionFresh,workActive,createConstructionChecker} from '../src/construction.mjs';
import {routeAroundConstruction} from '../src/construction-routing.mjs';
import {createRouter} from '../src/routing.mjs';import {createOfficialRouteVerifier} from '../src/verify-official-route.mjs';
const now=Date.parse('2026-11-07T08:00:00Z');
const work=(patch={})=>({id:'x',address:'test',start:'115/11/07',end:'115/11/07',hours:'24小時施工',longTerm:false,impact:'blocked',plan:'',geometries:[{type:'Point',coordinates:[[25,121.501]]}],...patch});
const snapshot=works=>({schemaVersion:1,fetchedAt:new Date(now).toISOString(),sourceUpdatedAt:new Date(now).toISOString(),works});
test('full long segment catches mid-route work site without sampling vertices',()=>{
 const check=createConstructionChecker(snapshot([work()]),now);
 assert.equal(check.inspect([[25,121.5],[25,121.502]]).blocked.length,1);
 assert.equal(check.inspect([[25.001,121.5],[25.001,121.502]]).blocked.length,0);
});
test('polygon containment, boundary crossing and zero-length entrance are inspected',()=>{
 const w=work({geometries:[{type:'Polygon',coordinates:[[25,121.5],[25,121.502],[25.001,121.502],[25.001,121.5],[25,121.5]]}]});
 const c=createConstructionChecker(snapshot([w]),now);
 assert.equal(c.inspect([[25.0005,121.499],[25.0005,121.503]]).blocked.length,1);
 assert.equal(c.inspect([[25.0005,121.501]]).blocked.length,1);
});
test('no impact record is advisory, never a new passability certificate',()=>{
 const c=createConstructionChecker(snapshot([work({impact:'clear'})]),now);const r=c.inspect([[25,121.5],[25,121.502]]);
 assert.equal(r.blocked.length,0);assert.equal(r.nearby.length,1);
});
test('dates, exact hours, overnight and long-term zones use Taipei time',()=>{
 assert.equal(workActive(work({end:'115/11/06'}),now),true); // inverted/invalid range remains unknown
 assert.equal(workActive(work({start:'115/11/01',end:'115/11/06'}),now),false);
 assert.equal(workActive(work({hours:'自09時00分至17時00分'}),now),true);
 assert.equal(workActive(work({hours:'自09時00分至15時00分'}),now),false);
 assert.equal(workActive(work({hours:'自09時00分至15時00分',longTerm:true}),now),true);
 assert.equal(workActive(work({hours:'自22時00分至06時00分'}),Date.parse('2026-11-07T17:00:00Z')),true);
 assert.equal(workActive(work({start:'115/11/08',end:'115/11/09'}),now),false);
 assert.equal(workActive(work({hours:'依交維計畫'}),now),true);
});
test('new fetch timestamp cannot disguise stale source data',()=>{
 const s=snapshot([]);s.sourceUpdatedAt='2026-11-06T00:00:00Z';assert.equal(constructionFresh(s,now),false);assert.throws(()=>createConstructionChecker(s,now));
});
test('normalizer strips staff contacts and converts TWD97 positions',()=>{
 const raw={type:'FeatureCollection',features:[{properties:{X:'302100',Y:'2771000',Tc_Tl3:'secret',Tc_Ma:'staff',IsBlock:'是',Positions:[[[302100,2771000],[302110,2771000]]]},geometry:{type:'Point',coordinates:[302100,2771000]}}]};
 const s=normalizeConstruction(raw,new Date(now).toISOString(),now);
 assert.equal(s.works[0].geometries[0].type,'LineString');assert.ok(s.works[0].geometries[0].coordinates[0][0]>25);assert.ok(!JSON.stringify(s).includes('secret'));assert.ok(!JSON.stringify(s).includes('staff'));
});
const A=[25,121.5],B=[25,121.502],C=[25.001,121.5],D=[25.001,121.502];
const proof={schemaVersion:2,coverage:1,maxUncoveredMetres:0,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
const graph={officialPathEvidence:{schemaVersion:2},officialAreas:[{type:'Polygon',coordinates:[[[121.499,24.999],[121.503,24.999],[121.503,25.002],[121.499,25.002],[121.499,24.999]]]}],officialCrossingAreas:[],roadGeometries:[[[121.51,25],[121.51,25.01]]],nodes:[A,B,C,D].map(p=>[...p,0]),ways:[{highway:'footway',width:2,slope:0,name:'人行道'}],edges:[[0,1,200,0,[],proof],[0,2,111,0,[],proof],[2,3,200,0,[],proof],[3,1,111,0,[],proof]]};
const candidate={provider:'taipei-official',coordinates:[A,B],segmentPaths:[[A,B]],crossingSegments:[],distance:200,steps:[]};
const deps={router:createRouter(graph),verifyOfficial:createOfficialRouteVerifier(graph)};
test('routing truly takes longer verified pedestrian path around construction',()=>{
 const r=routeAroundConstruction(candidate,A,B,{},snapshot([work()]),deps,now);
 assert.equal(r.provider,'local-detour');assert.equal(r.distance,422);assert.equal(r.construction.avoided,1);assert.ok(r.coordinates.some(p=>p[0]===25.001));
});
test('blocked start connector and no alternative are not presented as safe routes',()=>{
 const r=routeAroundConstruction(candidate,A,B,{},snapshot([work({geometries:[{type:'Point',coordinates:[A]}]})]),deps,now);
 assert.equal(r.error,'CONSTRUCTION_BLOCKED');assert.equal(r.coordinates,undefined);
});
test('stale or missing construction never silently becomes an empty closure list',()=>{
 assert.equal(routeAroundConstruction(candidate,A,B,{},null,deps,now).error,'CONSTRUCTION_UNAVAILABLE');
});
