import test from 'node:test';
import assert from 'node:assert/strict';
import {createRouter} from '../src/routing.mjs';
import {createLocalRouteVerifier,planPlaces} from '../src/local-route-verifier.mjs';
import {createConstructionChecker} from '../src/construction.mjs';

const a=[25,121.5],b=[25,121.501],p=[25+20/111195,121.5],q=[25+25/111195,121.501];
const proof={schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
const graph=()=>({officialPathEvidence:{schemaVersion:2},nodes:[[...a,0],[...b,0]],ways:[{name:'步道',highway:'footway',width:2,slope:0}],edges:[[0,1,100,0,[],proof]],officialAreas:[],officialCrossingAreas:[],roadGeometries:[[[121.51,25],[121.51,25.01]]]});
const selected=(point,id,sourceId)=>({id,kind:'place',sourceId,name:'已選地點',lat:point[0],lon:point[1],selectionKind:'user'});
const address=()=>selected(p,'address-25-121.5-0','osm');
const landmark=()=>selected(q,'taipei-landmark-25-121.5-0','taipei-landmark');
const snapshot=(works=[])=>{const now=new Date().toISOString();return {schemaVersion:1,fetchedAt:now,sourceUpdatedAt:now,works};};
function run(g,start,end,options={},works=[]){const s=snapshot(works),verifyLocal=createLocalRouteVerifier(g);return planPlaces(start,end,options,s,{router:createRouter(g),verifyLocal,facilities:[],checker:createConstructionChecker(s)});}

test('selected unregistered address and landmark each connect within 50m with visible unknown approaches',()=>{
 const result=run(graph(),address(),landmark());
 assert.equal(result.error,undefined);
 assert.deepEqual(result.approaches.map(x=>x.side),['start','end']);
 assert.ok(result.approaches.every(x=>x.estimated&&x.unconfirmed&&x.entryStatus==='unconfirmed'&&x.originKind==='selected'));
 assert.deepEqual(result.coordinates[0],p);assert.deepEqual(result.coordinates.at(-1),q);
 // Swapping the same explicitly chosen points keeps the same endpoint policy.
 const reversed=run(graph(),landmark(),address());assert.equal(reversed.error,undefined);
 assert.deepEqual(reversed.approaches.map(x=>x.side),['start','end']);
 assert.deepEqual(reversed.coordinates[0],q);assert.deepEqual(reversed.coordinates.at(-1),p);
});
test('the selected-point relaxation requires explicit user selection and leaves known-only and 50m limit intact',()=>{
 const g=graph(),v=createLocalRouteVerifier(g),addr=address();
 assert.equal(v.approachAllowed(p,a,{...addr,selectionKind:undefined},{},'start'),false);
 assert.equal(v.approachAllowed(p,a,addr,{knownOnly:true},'start'),false);
 const far=[25+51/111195,121.5];assert.equal(v.approachAllowed(far,a,selected(far,'address-far','osm'),{},'start'),false);
 assert.equal(v.approachAllowed(p,a,addr,{},'start'),true);
 assert.equal(v.userPointKind(p,addr,'start'),'selected');
 assert.equal(v.userPointKind(p,{...addr,foot:'no'},'start'),null);
});
test('selected source attributes, registered identities and same-coordinate blocked aliases cannot bypass restrictions',()=>{
 const g=graph();
 for(const patch of [{foot:'no'},{access:'private'},{'foot:conditional':'no @ night'},{name:'2F廁所'},{indoor:'yes'},{level:'-1'},{barrier:'gate'}]){
  assert.equal(createLocalRouteVerifier(g).approachAllowed(p,a,{...address(),...patch},{},'start'),false,JSON.stringify(patch));
 }
 const blocked={id:'osm-n12',kind:'place',sourceId:'osm',osmRestrictionsMatched:true,lat:p[0],lon:p[1],access:'no'};
 const v=createLocalRouteVerifier(g,[],[blocked]);assert.equal(v.approachAllowed(p,a,address(),{},'start'),false);
 assert.equal(v.userPointKind(p,address(),'start'),null);
 const unverified={...blocked,access:undefined,osmRestrictionsMatched:false};
 assert.equal(createLocalRouteVerifier(g,[],[unverified]).approachAllowed(p,a,address(),{},'start'),false);
 const changed={id:'registered',kind:'place',lat:p[0]+.0001,lon:p[1]};
 assert.equal(createLocalRouteVerifier(g,[],[changed]).approachAllowed(p,a,selected(p,'registered','provider'),{},'start'),false);
 assert.equal(createLocalRouteVerifier(g).approachAllowed(p,a,selected(p,'osm-n99','osm'),{},'start'),false);
});
test('selected coordinates cannot bypass road, blocked node or construction',()=>{
 const g=graph(),addr=address();g.roadGeometries=[[[121.499,25+10/111195],[121.502,25+10/111195]]];
 assert.equal(createLocalRouteVerifier(g).approachAllowed(p,a,addr,{},'start'),false);
 const h=graph();h.nodes.push([25+10/111195,121.5,1]);assert.equal(run(h,addr,{lat:b[0],lon:b[1]}).error,'NO_CONNECTION');
 const today=new Date(),local=new Date(today.getTime()+8*3600000),date=`${local.getUTCFullYear()-1911}/${local.getUTCMonth()+1}/${local.getUTCDate()}`;
 const closed={id:'closed',start:date,end:date,hours:'24小時施工',impact:'blocked',geometries:[{type:'Point',coordinates:[p]}]};
 assert.equal(run(graph(),addr,{lat:b[0],lon:b[1]}, {},[closed]).error,'CONSTRUCTION_BLOCKED');
});
