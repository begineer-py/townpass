import test from 'node:test';
import assert from 'node:assert/strict';
import {createRouter} from '../src/routing.mjs';
import {createLocalRouteVerifier} from '../src/local-route-verifier.mjs';
import {createConstructionChecker} from '../src/construction.mjs';
import {improvePedestrianRoute,hasNewPedestrianNearShared,hasNewSidewalkNearReplaced} from '../src/pedestrian-improvement.mjs';
import {planImprovedPlaces} from '../src/pedestrian-planning.mjs';
const n=(x,y)=>[25+y/111195,121.5+x/100700,0];
const proof={schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
const shared={...proof,sharedRoad:true,sourceTopologyVerified:true,junctionsVerified:true,roadIntersectionsVerified:true,barriersVerified:true};
const graph=(height=15)=>({officialPathEvidence:{schemaVersion:2},officialAreas:[],officialCrossingAreas:[],roadGeometries:[],nodes:[n(0,0),n(10,0),n(110,0),n(0,height),n(10,height)],ways:[{name:'共行',highway:'residential',source:'osm-shared-street',width:null,slope:null},{name:'步道',highway:'footway',width:1.5,slope:0}],edges:[[0,1,10,0,[],shared],[1,2,100,1,[],proof],[0,3,height,1,[],proof],[3,4,10,1,[],proof],[4,1,height,1,[],proof]]});
const snapshot=works=>{const t=new Date().toISOString();return {schemaVersion:1,fetchedAt:t,sourceUpdatedAt:t,works};};
function setup(height=15,works=[]){const g=graph(height),snap=snapshot(works),router=createRouter(g),verifyLocal=createLocalRouteVerifier(g),checker=createConstructionChecker(snap),start=g.nodes[0].slice(0,2),end=g.nodes[2].slice(0,2),options={approachAllowed:(p,q)=>p[0]===q[0]&&p[1]===q[1]},raw=router(start,end,{...options,lineAllowed:checker.allowed}),base=verifyLocal(raw,start,end,options);return {g,snap,router,verifyLocal,checker,start,end,options,base};}
const improve=x=>improvePedestrianRoute(x.base,x.start,x.end,x.options,x.snap,{graph:x.g,router:x.router,verifyLocal:x.verifyLocal,checker:x.checker});

test('reduces actual shared-road length using a connected nearby pedestrian detour inside both limits',()=>{
 const x=setup();assert.equal(x.base.distance,110);assert.equal(x.base.roadPct,9);
 const result=improve(x);assert.equal(result.error,undefined);assert.equal(result.roadPct,0);assert.ok(result.distance>110&&result.distance<=143);
 assert.equal(result.pedestrianImprovement.originalSharedMetres,10);assert.equal(result.pedestrianImprovement.sharedMetres,0);
 assert.ok(result.pedestrianImprovement.iterations.some(i=>i.result==='improved'));
 const chosen=result.pedestrianImprovement.iterations.flatMap(i=>i.attempts).find(a=>a.selected);
 assert.ok(chosen);assert.equal(chosen.reason,'eligible');assert.equal(chosen.sharedMetres,0);assert.ok(Number.isFinite(chosen.distanceMetres));
});
test('a route with no shared road can improve its explicit sidewalk share',()=>{
 const g=graph();g.ways[0]={...g.ways[0],highway:'path',source:undefined,width:1.5,slope:0};g.edges[0][5]=proof;
 g.ways.push({...g.ways[1],footway:'sidewalk'});for(const e of g.edges.slice(2))e[3]=2;
 const snap=snapshot([]),checker=createConstructionChecker(snap),router=createRouter(g),verifyLocal=createLocalRouteVerifier(g),start=g.nodes[0].slice(0,2),end=g.nodes[2].slice(0,2),options={approachAllowed:(p,q)=>p[0]===q[0]&&p[1]===q[1]};
 const base=verifyLocal(router(start,end,{...options,lineAllowed:checker.allowed}),start,end,options),result=improvePedestrianRoute(base,start,end,options,snap,{graph:g,router,verifyLocal,checker});
 assert.equal(base.distance,110);assert.equal(result.error,undefined);assert.equal(result.distance,140);
 assert.equal(result.pedestrianImprovement.originalSharedMetres,0);assert.equal(result.pedestrianImprovement.sharedMetres,0);
 assert.ok(result.pedestrianImprovement.explicitSidewalkMetres>0);assert.equal(result.pedestrianImprovement.iterations[0].improvementKind,'sidewalk-share-increased');
});
test('shared reduction is rejected if full-route explicit sidewalk share decreases',()=>{
 const g=graph();g.ways[1].footway='sidewalk';g.ways.push({...g.ways[1],footway:null});for(const e of g.edges.slice(2))e[3]=2;
 const snap=snapshot([]),checker=createConstructionChecker(snap),router=createRouter(g),verifyLocal=createLocalRouteVerifier(g),start=g.nodes[0].slice(0,2),end=g.nodes[2].slice(0,2),options={approachAllowed:(p,q)=>p[0]===q[0]&&p[1]===q[1]};
 const base=verifyLocal(router(start,end,{...options,lineAllowed:checker.allowed}),start,end,options),result=improvePedestrianRoute(base,start,end,options,snap,{graph:g,router,verifyLocal,checker});
 assert.equal(result.distance,110);assert.equal(result.pedestrianImprovement.sharedMetres,10);
 assert.ok(result.pedestrianImprovement.iterations[0].reasons.includes('sidewalk-share-regression'));
});
test('compares exact sidewalk share before distance rounding',()=>{
 const g={nodes:[n(0,0),n(10,0),n(100,0)],ways:[{highway:'residential',source:'osm-shared-street'},{highway:'footway',footway:'sidewalk'},{highway:'path'}],edges:[[0,1,10,0,[],shared],[1,2,90,1,[],proof],[0,1,10.001,2,[],proof]]};
 const base={edgeIds:[0,1],nodeIds:[0,1,2],coordinates:g.nodes.map(p=>p.slice(0,2)),distance:100},candidate={...base,edgeIds:[2,1],distance:100,costBreakdown:{base:100.001}};
 const snapshotNow=snapshot([]),checker={allowed:()=>true,inspect:()=>({blocked:[]})},result=improvePedestrianRoute(base,g.nodes[0].slice(0,2),g.nodes[2].slice(0,2),{},snapshotNow,{graph:g,router:()=>candidate,verifyLocal:x=>x,checker});
 assert.deepEqual(result.edgeIds,[0,1]);assert.ok(result.pedestrianImprovement.iterations[0].reasons.includes('sidewalk-share-regression'));
});
test('shared planning entry resolves and keeps actual registered station exit identities',()=>{
 const g=graph(),snap=snapshot([]),checker=createConstructionChecker(snap),exit={id:'exit',kind:'metro-elevator',station:'測試',name:'測試出口',lat:g.nodes[0][0],lon:g.nodes[0][1]},facilities=[exit],v=createLocalRouteVerifier(g,facilities),baseRouter=createRouter(g),router=(a,b,o={})=>baseRouter(a,b,{...o,approachAllowed:(p,q,side)=>p[0]===q[0]&&p[1]===q[1]&&v.approachAllowed(p,q,side==='start'?o.startPlace:o.endPlace,o,side)});
 const result=planImprovedPlaces({kind:'20',name:'測試站',lat:25.01,lon:121.51},{lat:g.nodes[2][0],lon:g.nodes[2][1]}, {},snap,{graph:g,router,verifyLocal:v,facilities,checker});
 assert.equal(result.error,undefined);assert.equal(result.resolvedStart.id,'exit');assert.equal(result.pedestrianImprovement.status,'improved');
 assert.deepEqual(result.coordinates[0],[exit.lat,exit.lon]);
});
test('does not accept a detour over 130 percent even when it avoids shared road',()=>{
 const x=setup(30),result=improve(x);assert.equal(result.distance,110);assert.equal(result.roadPct,9);
 assert.ok(result.pedestrianImprovement.iterations.some(i=>i.reasons.includes('detour-limit')));
});
test('also enforces the original plus 300m cap on long routes',()=>{
 const g=graph(198);g.nodes[1]=n(100,0);g.nodes[2]=n(2000,0);g.nodes[3]=n(50,198);
 g.edges=[[0,1,100,0,[],shared],[1,2,1900,1,[],proof],[0,3,Math.hypot(50,198),1,[],proof],[3,1,Math.hypot(50,198),1,[],proof]];
 const snap=snapshot([]),checker=createConstructionChecker(snap),router=createRouter(g),verifyLocal=createLocalRouteVerifier(g),start=g.nodes[0].slice(0,2),end=g.nodes[2].slice(0,2),options={approachAllowed:(p,q)=>p[0]===q[0]&&p[1]===q[1]};
 const base=verifyLocal(router(start,end,{...options,lineAllowed:checker.allowed}),start,end,options),result=improvePedestrianRoute(base,start,end,options,snap,{graph:g,router,verifyLocal,checker},{penalties:[20]});
 assert.equal(base.distance,2000);assert.equal(result.distance,2000);assert.equal(result.pedestrianImprovement.maxDistanceMetres,2300);
 assert.ok(result.pedestrianImprovement.iterations[0].reasons.includes('detour-limit'));
});
test('a via leg uses the whole original journey budget rather than a separate leg percentage',()=>{
 const x=setup(),via=x.g.nodes[1].slice(0,2),base=x.verifyLocal(x.router(x.start,via,{...x.options,lineAllowed:x.checker.allowed}),x.start,via,x.options);
 const deps={graph:x.g,router:x.router,verifyLocal:x.verifyLocal,checker:x.checker};
 const local=improvePedestrianRoute(base,x.start,via,x.options,x.snap,deps);
 assert.equal(local.distance,10);
 const joint=improvePedestrianRoute(base,x.start,via,x.options,x.snap,deps,{parentBaselineDistance:110,otherLegDistance:100});
 assert.equal(joint.distance,40);assert.equal(joint.pedestrianImprovement.maxDistanceMetres,43);assert.equal(joint.pedestrianImprovement.sharedMetres,0);
 const withOtherSidewalk=improvePedestrianRoute(base,x.start,via,x.options,x.snap,deps,{parentBaselineDistance:110,otherLegDistance:100,otherLegSidewalkMetres:50});
 assert.equal(withOtherSidewalk.distance,10);assert.ok(withOtherSidewalk.pedestrianImprovement.iterations[0].reasons.includes('sidewalk-share-regression'));
});
test('repeated improvements keep the original distance budget rather than compounding it',()=>{
 const g={nodes:[n(0,0),n(10,0),n(100,0),n(1,10),n(1,20)],ways:[{highway:'residential',source:'osm-shared-street'},{highway:'footway'}],edges:[[0,1,100,0,[],shared],[1,2,900,1,[],proof],[0,3,80,0,[],shared],[3,2,1120,1,[],proof],[0,4,60,0,[],shared],[4,2,1340,1,[],proof]]};
 const route=(ids,nodes,distance)=>({edgeIds:ids,nodeIds:nodes,coordinates:nodes.map(i=>g.nodes[i].slice(0,2)),distance,costBreakdown:{base:distance}}),base=route([0,1],[0,1,2],1000),first=route([2,3],[0,3,2],1200),second=route([4,5],[0,4,2],1400);
 let calls=0;const router=()=>++calls<=9?first:second,verifyLocal=c=>c,checker={allowed:()=>true,inspect:()=>({blocked:[]})},snap=snapshot([]);
 const result=improvePedestrianRoute(base,g.nodes[0].slice(0,2),g.nodes[2].slice(0,2),{},snap,{graph:g,router,verifyLocal,checker});
 assert.equal(result.distance,1200);assert.equal(result.pedestrianImprovement.maxDistanceMetres,1300);
 assert.ok(result.pedestrianImprovement.iterations[1].reasons.includes('detour-limit'));
});
test('knownOnly never permits an unknown-width or unknown-slope alternate',()=>{
 const g=graph();g.ways[0]={...g.ways[0],width:1.5,slope:0};g.ways.push({...g.ways[1],width:null});for(const e of g.edges.slice(2))e[3]=2;
 const snap=snapshot([]),checker=createConstructionChecker(snap),router=createRouter(g),verifyLocal=createLocalRouteVerifier(g),start=g.nodes[0].slice(0,2),end=g.nodes[2].slice(0,2),options={knownOnly:true,approachAllowed:(p,q)=>p[0]===q[0]&&p[1]===q[1]};
 const base=verifyLocal(router(start,end,{...options,lineAllowed:checker.allowed}),start,end,options),result=improvePedestrianRoute(base,start,end,options,snap,{graph:g,router,verifyLocal,checker});
 assert.equal(result.error,undefined);assert.equal(result.distance,110);assert.equal(result.pedestrianImprovement.sharedMetres,10);
});
test('never invents a connection to a nearby isolated pedestrian edge',()=>{
 const g=graph();g.nodes.push(n(15,20));g.edges=g.edges.slice(0,2).concat([[3,5,10,1,[],proof]]);
 const snap=snapshot([]),checker=createConstructionChecker(snap),router=createRouter(g),verifyLocal=createLocalRouteVerifier(g),start=g.nodes[0].slice(0,2),end=g.nodes[2].slice(0,2),options={approachAllowed:(p,q)=>p[0]===q[0]&&p[1]===q[1]};
 const base=verifyLocal(router(start,end,{...options,lineAllowed:checker.allowed}),start,end,options),result=improvePedestrianRoute(base,start,end,options,snap,{graph:g,router,verifyLocal,checker});
 assert.equal(result.distance,110);assert.equal(result.roadPct,9);assert.notEqual(result.pedestrianImprovement.status,'improved');
});
test('construction blocking the pedestrian detour preserves the original verified route',()=>{
 const now=new Date(),t=new Date(now.getTime()+8*3600000),day=`${t.getUTCFullYear()-1911}/${t.getUTCMonth()+1}/${t.getUTCDate()}`;
 const works=[{id:'work',start:day,end:day,hours:'24小時施工',impact:'blocked',geometries:[{type:'Point',coordinates:[n(5,15).slice(0,2)]}]}],x=setup(15,works),result=improve(x);
 assert.equal(result.error,undefined);assert.equal(result.distance,110);assert.equal(result.roadPct,9);
});
test('stale construction and exhausted search never release an unverified alternative',()=>{
 const x=setup(),deps={graph:x.g,router:()=>({error:'OPTIMIZATION_BUDGET'}),verifyLocal:x.verifyLocal,checker:x.checker};
 assert.equal(improvePedestrianRoute(x.base,x.start,x.end,x.options,{...x.snap,sourceUpdatedAt:'2020-01-01T00:00:00Z'},deps).error,'CONSTRUCTION_UNAVAILABLE');
 const result=improvePedestrianRoute(x.base,x.start,x.end,x.options,x.snap,deps);assert.equal(result.distance,110);assert.equal(result.pedestrianImprovement.status,'search-limit');
});
test('a slow synchronous search cannot deliver an improvement after the deadline',()=>{
 const x=setup(),alternate=x.router(x.start,x.end,{...x.options,lineAllowed:x.checker.allowed,_optimizeSharedPenalty:20});
 const slow=()=>{const until=Date.now()+20;while(Date.now()<until){}return alternate;};
 const result=improvePedestrianRoute(x.base,x.start,x.end,x.options,x.snap,{graph:x.g,router:slow,verifyLocal:x.verifyLocal,checker:x.checker},{totalMs:5});
 assert.equal(result.distance,110);assert.equal(result.pedestrianImprovement.status,'time-limit');
});
test('timeout after an earlier improved round explicitly rolls back to the original route',()=>{
 const x=setup();x.g.ways.push({...x.g.ways[0]});x.g.edges[1][3]=2;x.g.edges[1][5]=shared;
 x.base=x.verifyLocal(x.router(x.start,x.end,{...x.options,lineAllowed:x.checker.allowed}),x.start,x.end,x.options);
 const alternate=x.router(x.start,x.end,{...x.options,lineAllowed:x.checker.allowed,_optimizeSharedPenalty:20});let calls=0;
 const delayed=()=>{if(++calls>1){const until=Date.now()+30;while(Date.now()<until){}}return alternate;};
 const result=improvePedestrianRoute(x.base,x.start,x.end,x.options,x.snap,{graph:x.g,router:delayed,verifyLocal:x.verifyLocal,checker:x.checker},{totalMs:20,penalties:[20],sidewalkPenalties:[0]});
 assert.equal(result.distance,110);assert.equal(result.pedestrianImprovement.status,'time-limit');assert.equal(result.pedestrianImprovement.rolledBack,true);
 assert.equal(result.pedestrianImprovement.iterations[0].rolledBack,true);
});
test('a perpendicular crossing is not an along-route pedestrian alternative',()=>{
 const g={nodes:[n(0,0),n(100,0),n(50,-20),n(50,20),n(0,20),n(100,20)],ways:[{highway:'residential',source:'osm-shared-street'},{highway:'footway',crossing:true},{highway:'footway',crossing:false}],edges:[[0,1,100,0,[],shared],[2,3,40,1,[],proof],[2,3,40,2,[],proof],[4,5,100,2,[],proof]]};
 assert.equal(hasNewPedestrianNearShared(g,{edgeIds:[0]},{edgeIds:[1]}).near,false);
 assert.equal(hasNewPedestrianNearShared(g,{edgeIds:[0]},{edgeIds:[2]}).near,false);
 assert.equal(hasNewPedestrianNearShared(g,{edgeIds:[0]},{edgeIds:[3]}).near,true);
 g.ways[2].footway='sidewalk';assert.equal(hasNewSidewalkNearReplaced(g,{edgeIds:[0]},{edgeIds:[2]}).near,false);
 assert.equal(hasNewSidewalkNearReplaced(g,{edgeIds:[0]},{edgeIds:[3]}).near,true);
 g.ways[2].highway='path';assert.equal(hasNewSidewalkNearReplaced(g,{edgeIds:[0]},{edgeIds:[3]}).near,false);
});
test('nearby pedestrian edge must correspond to shared geometry actually removed',()=>{
 const g={nodes:[n(0,0),n(100,0),n(500,0),n(600,0),n(0,10),n(100,10)],ways:[{highway:'residential',source:'osm-shared-street'},{highway:'footway'}],edges:[[0,1,100,0,[],shared],[2,3,100,0,[],shared],[4,5,100,1,[],proof]]};
 assert.equal(hasNewPedestrianNearShared(g,{edgeIds:[0,1]},{edgeIds:[0,2]}).near,false);
});
test('new sidewalk must be near a non-sidewalk portion actually replaced',()=>{
 const g={nodes:[n(0,0),n(100,0),n(500,0),n(600,0),n(0,10),n(100,10)],ways:[{highway:'path'},{highway:'footway',footway:'sidewalk'}],edges:[[0,1,100,0,[],proof],[2,3,100,0,[],proof],[4,5,100,1,[],proof]]};
 assert.equal(hasNewSidewalkNearReplaced(g,{edgeIds:[0,1]},{edgeIds:[0,2]}).near,false);
 assert.equal(hasNewSidewalkNearReplaced(g,{edgeIds:[0,1]},{edgeIds:[1,2]}).near,true);
});
test('partially retained projected shared edge credits only its removed portion',()=>{
 const g={nodes:[n(0,0),n(100,0),n(50,0),n(0,10),n(50,10),n(100,10)],ways:[{highway:'residential',source:'osm-shared-street'},{highway:'footway'}],edges:[[0,1,100,0,[],shared],[0,2,50,0,[],{...shared,derivedFrom:0}],[3,4,50,1,[],proof],[4,5,50,1,[],proof]]};
 assert.equal(hasNewPedestrianNearShared(g,{edgeIds:[0]},{edgeIds:[1,2]}).near,false);
 assert.equal(hasNewPedestrianNearShared(g,{edgeIds:[0]},{edgeIds:[1,3]}).near,true);
});
test('additional geometry on a partly used pedestrian edge can qualify',()=>{
 const g={nodes:[n(0,10),n(100,10),n(10,10),n(10,0),n(100,0)],ways:[{highway:'footway'},{highway:'residential',source:'osm-shared-street'}],edges:[[0,1,100,0,[],proof],[0,2,10,0,[],{...proof,derivedFrom:0}],[3,4,90,1,[],shared]]};
 assert.equal(hasNewPedestrianNearShared(g,{edgeIds:[1,2]},{edgeIds:[0]}).near,true);
});
test('official route without matched graph provenance is retained with an explicit unsupported status',()=>{
 const x=setup(),official={...x.base,provider:'taipei-official'};
 const result=improvePedestrianRoute(official,x.start,x.end,x.options,x.snap,{graph:x.g,router:x.router,verifyLocal:x.verifyLocal,checker:x.checker});
 assert.equal(result.provider,'taipei-official');assert.equal(result.pedestrianImprovement.status,'unsupported-official-provenance');
});
