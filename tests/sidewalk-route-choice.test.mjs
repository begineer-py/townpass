import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseSidewalkImprovement,compareSidewalkRouteScores} from '../src/sidewalk-route-choice.mjs';
import {metres,ROUTING_POLICY} from '../src/routing.mjs';
const A=[25,121.5],M=[25.0005,121.5],B=[25.001,121.5];
const segment=(coordinates,extra)=>({coordinates,distance:metres(...coordinates),sharedRoad:false,explicitSidewalk:false,crossing:false,tier:'osm',...extra});
function fixture(){
 const stamp=new Date().toISOString(),snapshot={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]},construction={sourceUpdatedAt:stamp,blocked:[]},officialConditions={status:'available',fetchedAt:stamp,sourceObservedAt:null,points:[]};
 const local={policyVersion:ROUTING_POLICY,geometryVerification:'pedestrian-network-v1',distance:Math.round(metres(A,M)+metres(M,B)),coordinates:[A,M,B],networkCoordinates:[A,M,B],approaches:[],construction,officialConditions,tierSegments:[segment([A,M],{tier:'shared',sharedRoad:true}),segment([M,B],{explicitSidewalk:true})]};
 const officialSegments=[{kind:'endpoint-approach',coordinates:[A,A],distanceMetres:0},{kind:'official-line',coordinates:[A,M],distanceMetres:metres(A,M),crossing:false},{kind:'osm',coordinates:[M,B],distanceMetres:metres(M,B),explicitSidewalk:true,sharedRoad:false,crossing:false},{kind:'endpoint-approach',coordinates:[B,B],distanceMetres:0}];
 const total=officialSegments.reduce((n,s)=>n+s.distanceMetres,0),route={kind:'official-passageway',verification:'official-source-screened-v1',navigationAllowed:true,policyVersion:ROUTING_POLICY,sourceHash:'a'.repeat(64),construction,officialConditions,segments:officialSegments,coordinates:[A,M,B],distanceMetres:total,distance:Math.round(total)};
 const start={lat:A[0],lon:A[1]},end={lat:B[0],lon:B[1]},candidate={id:'official-1',route,score:-999,coverage:{generalSidewalkMetres:0}};
 return {currentRoute:local,referenceCandidates:[candidate],start,end,snapshot,referenceSnapshot:snapshot};
}
test('chooses independently verified sidewalk route from measured segments rather than supplied score',()=>{
 const f=fixture(),r=chooseSidewalkImprovement(f);assert.ok(r);assert.equal(r.candidate,f.referenceCandidates[0]);
 assert.ok(r.improved.sidewalk>r.baseline.sidewalk);assert.ok(r.improved.shared<r.baseline.shared);assert.ok(r.improved.score.value>r.baseline.score.value);
 assert.equal(r.improved.score.parts.unknown,-12);assert.equal(r.baseline.score.parts.unknown,-12);
});
test('compares verified sidewalk geometry when condition records are unavailable for both routes',()=>{
 const f=fixture();f.currentRoute.officialConditions={status:'unavailable'};f.referenceCandidates[0].route.officialConditions={status:'unavailable'};
 const choice=chooseSidewalkImprovement(f);
 assert.ok(choice);assert.equal(choice.improved.score.parts.officialConditions,-2);assert.equal(choice.baseline.score.parts.officialConditions,-2);
 assert.ok(choice.improved.sidewalk>choice.baseline.sidewalk);assert.ok(choice.improved.shared<choice.baseline.shared);
});
test('accepts a shorter route with less shared road and higher sidewalk share even when sidewalk metres fall',()=>{
 const f=fixture(),C=[25.002,121.5],r=f.currentRoute;
 r.coordinates=[A,C,B];r.networkCoordinates=[A,C,B];r.tierSegments=[segment([A,C],{tier:'shared',sharedRoad:true}),segment([C,B],{explicitSidewalk:true})];
 r.distance=Math.round(r.tierSegments.reduce((sum,s)=>sum+s.distance,0));
 const choice=chooseSidewalkImprovement(f);
 assert.ok(choice);assert.ok(choice.improved.sidewalk<=choice.baseline.sidewalk+1);assert.ok(choice.improved.distance<choice.baseline.distance);
 assert.ok(choice.improved.shared<choice.baseline.shared);assert.ok(choice.improved.sidewalk/choice.improved.distance>choice.baseline.sidewalk/choice.baseline.distance);
});
test('retains the user selection or a currently followed route',()=>{
 assert.equal(chooseSidewalkImprovement({...fixture(),userSelected:true}),null);
 assert.equal(chooseSidewalkImprovement({...fixture(),following:true}),null);
});
test('refuses stale, mismatched, unverifiable or incompletely annotated inputs',()=>{
 const a=fixture();a.referenceSnapshot={...a.snapshot,sourceUpdatedAt:'2000-01-01T00:00:00Z'};assert.equal(chooseSidewalkImprovement(a),null);
 const b=fixture();b.referenceCandidates[0].route.coordinates=[A,[25.02,121.52],B];assert.equal(chooseSidewalkImprovement(b),null);
 const c=fixture();c.currentRoute.tierSegments[0].distance+=10;assert.equal(chooseSidewalkImprovement(c),null);
 const d=fixture();d.currentRoute.officialConditions={status:'unavailable',points:[]};assert.equal(chooseSidewalkImprovement(d),null);
 const e=fixture();e.referenceCandidates[0].route.construction={...e.snapshot,blocked:[{}]};assert.equal(chooseSidewalkImprovement(e),null);
 const g=fixture();g.referenceCandidates[0].route.verification='pending-source-validation';assert.equal(chooseSidewalkImprovement(g),null);
 const h=fixture();h.end={...h.end,lat:h.end.lat+.001};assert.equal(chooseSidewalkImprovement(h),null);
 const j=fixture();j.referenceCandidates[0].route.officialConditions={...j.currentRoute.officialConditions,fetchedAt:'2026-01-01T00:00:00Z'};assert.equal(chooseSidewalkImprovement(j),null);
});
test('does not swap for a route with no improvement or a detour beyond the budget',()=>{
 const f=fixture();f.currentRoute.tierSegments[0].sharedRoad=false;f.currentRoute.tierSegments[0].explicitSidewalk=true;assert.equal(chooseSidewalkImprovement(f),null);
 const g=fixture(),r=g.referenceCandidates[0].route,C=[25.002,121.5];
 r.segments[1].coordinates=[A,C];r.segments[1].distanceMetres=metres(A,C);r.segments[2].coordinates=[C,B];r.segments[2].distanceMetres=metres(C,B);r.coordinates=[A,C,B];r.distanceMetres=r.segments.reduce((n,s)=>n+s.distanceMetres,0);r.distance=Math.round(r.distanceMetres);
 assert.equal(chooseSidewalkImprovement(g),null);
});
test('does not replace a route when nearby official conditions outweigh the sidewalk benefit',()=>{
 const f=fixture(),points=Array.from({length:12},(_,i)=>({type:'missing_noCurbSlope',activity:'活動區域分類-高',id:String(i),distanceMetres:0})),p=[25.0001,121.5];
 f.currentRoute.networkCoordinates=[A,p,B];f.currentRoute.coordinates=[A,p,B];f.currentRoute.tierSegments=[segment([A,p],{tier:'shared',sharedRoad:true}),segment([p,B],{explicitSidewalk:true})];f.currentRoute.distance=Math.round(metres(A,p)+metres(p,B));
 f.referenceCandidates[0].route.officialConditions={...f.currentRoute.officialConditions,points};
 assert.equal(chooseSidewalkImprovement(f),null);
 const compared=compareSidewalkRouteScores(f);assert.equal(compared.referenceCandidates[0].score.parts.officialConditions,-20);assert.ok(compared.referenceCandidates[0].score.value<compared.current.score.value);
});

test('accepts verified condition-overlay subdivisions but rejects a shortcut over a bend',()=>{
 const f=fixture(),mid=[(A[0]+M[0])/2,A[1]];f.currentRoute.tierSegments[0].coordinates=[A,mid,M];assert.ok(chooseSidewalkImprovement(f));
 const g=fixture(),corner=[25.0005,121.5005];g.currentRoute.networkCoordinates=[A,corner,B];assert.equal(chooseSidewalkImprovement(g),null);
});

function comparisonFixture(){const f=fixture();return {...f,localCandidates:[{id:'local-1',route:f.currentRoute,score:999}],referenceSourceHash:'a'.repeat(64)};}
test('one common distance baseline and scoring policy for local and source candidates',()=>{
 const f=comparisonFixture(),r=compareSidewalkRouteScores(f);assert.equal(r.status,'ready');assert.equal(r.localCandidates.length,1);assert.equal(r.referenceCandidates.length,1);
 assert.equal(r.shortestDistanceMetres,Math.min(f.currentRoute.distance,f.referenceCandidates[0].route.distanceMetres));
 assert.equal(r.current.score.value,r.localCandidates[0].score.value);assert.equal(r.referenceCandidates[0].metrics.sidewalk,metres(A,M)+metres(M,B));
 assert.notEqual(r.localCandidates[0].score.value,999);assert.notEqual(r.referenceCandidates[0].score.value,-999);
 for(const item of [r.current,...r.localCandidates,...r.referenceCandidates]){
  const m=item.metrics,p=item.score.parts;assert.equal(p.unknown,-12);assert.ok(Math.abs(p.sidewalk-40*m.sidewalk/m.distance)<1e-9);assert.ok(Math.abs(p.detour+20*Math.max(0,m.distance-r.shortestDistanceMetres)/r.shortestDistanceMetres)<1e-9);
 }
});
test('common scoring never creates or silently switches a selected route',()=>{
 const f=comparisonFixture(),source=f.referenceCandidates[0].route,r=compareSidewalkRouteScores({...f,currentRoute:source,userSelected:true,following:true});
 assert.equal(r.status,'ready');assert.equal(r.current.route,source);assert.equal(f.currentRoute.geometryVerification,'pedestrian-network-v1');
 assert.equal(chooseSidewalkImprovement({...f,userSelected:true}),null);assert.equal(chooseSidewalkImprovement({...f,following:true}),null);
});
test('common scoring filters mismatched source, geometry and unverified inputs instead of inventing scores',()=>{
 const f=comparisonFixture(),good=f.referenceCandidates[0],bad=structuredClone(good);bad.id='bad';bad.route.sourceHash='b'.repeat(64);bad.score=100;
 f.referenceCandidates.push(bad);let r=compareSidewalkRouteScores(f);assert.equal(r.status,'ready');assert.equal(r.referenceCandidates.length,1);assert.equal(r.filteredReferenceCount,1);
 const g=comparisonFixture();g.referenceCandidates[0].route.coordinates=[A,[25.1,121.6],B];r=compareSidewalkRouteScores(g);assert.equal(r.status,'unavailable');assert.deepEqual(r.referenceCandidates,[]);
 const h=comparisonFixture();h.referenceCandidates[0].route.officialConditions={status:'unavailable',points:[]};assert.equal(compareSidewalkRouteScores(h).status,'unavailable');
 const j=comparisonFixture();j.snapshot={...j.snapshot,sourceUpdatedAt:'2000-01-01T00:00:00Z'};assert.equal(compareSidewalkRouteScores(j).status,'unavailable');
 const k=comparisonFixture();k.referenceSourceHash='b'.repeat(64);assert.equal(compareSidewalkRouteScores(k).status,'unavailable');assert.equal(chooseSidewalkImprovement(k),null);
});
test('excessively long alternatives do not gain from fewer uncertain official observations',()=>{
 const f=comparisonFixture(),candidate=structuredClone(f.referenceCandidates[0]),r=candidate.route,C=[25.002,121.5];candidate.id='long';
 r.segments[1].coordinates=[A,C];r.segments[1].distanceMetres=metres(A,C);r.segments[2].coordinates=[C,B];r.segments[2].distanceMetres=metres(C,B);r.coordinates=[A,C,B];r.distanceMetres=r.segments.reduce((n,s)=>n+s.distanceMetres,0);r.distance=Math.round(r.distanceMetres);
 const points=Array.from({length:5},(_,i)=>({type:'missing_noCurbSlope',activity:'活動區域分類-高',id:String(i),distanceMetres:1}));f.currentRoute.officialConditions={...f.currentRoute.officialConditions,points};f.localCandidates[0].route=f.currentRoute;f.referenceCandidates=[candidate];
 const result=compareSidewalkRouteScores(f);assert.equal(result.status,'ready');assert.equal(result.referenceCandidates[0].score.parts.conditionDetourGuard,-15);assert.equal(chooseSidewalkImprovement(f),null);
});

test('auto choice uses the displayed common score even if a shorter reference route has no sidewalk improvement',()=>{
 const f=comparisonFixture(),bend=[25.0005,121.5004],local=f.currentRoute;
 local.networkCoordinates=[A,bend,B];local.coordinates=[A,bend,B];local.tierSegments=[segment([A,bend],{tier:'shared',sharedRoad:true}),segment([bend,B],{explicitSidewalk:true})];local.distance=Math.round(local.tierSegments.reduce((n,s)=>n+s.distance,0));
 const good=f.referenceCandidates[0],route=good.route;route.segments[1].coordinates=[A,bend];route.segments[1].distanceMetres=metres(A,bend);route.segments[2].coordinates=[bend,B];route.segments[2].distanceMetres=metres(bend,B);route.coordinates=[A,bend,B];route.distanceMetres=route.segments.reduce((n,s)=>n+s.distanceMetres,0);route.distance=Math.round(route.distanceMetres);
 const short=structuredClone(good);short.id='short-no-improvement';short.route.segments=[{kind:'endpoint-approach',coordinates:[A,A],distanceMetres:0},{kind:'osm',coordinates:[A,B],distanceMetres:metres(A,B),explicitSidewalk:false,sharedRoad:true,crossing:false},{kind:'endpoint-approach',coordinates:[B,B],distanceMetres:0}];short.route.coordinates=[A,B];short.route.distanceMetres=metres(A,B);short.route.distance=Math.round(short.route.distanceMetres);
 f.referenceCandidates.push(short);const displayed=compareSidewalkRouteScores(f),choice=chooseSidewalkImprovement(f);
 assert.equal(displayed.status,'ready');assert.ok(choice);assert.equal(choice.candidate.id,'official-1');assert.equal(choice.shortestDistanceMetres,short.route.distanceMetres);
 assert.equal(choice.baseline.score.value,displayed.current.score.value);assert.equal(choice.improved.score.value,displayed.referenceCandidates.find(c=>c.candidate.id===choice.candidate.id).score.value);
});
