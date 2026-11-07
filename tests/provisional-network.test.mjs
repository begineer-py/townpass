import test from 'node:test';
import assert from 'node:assert/strict';
import proj4 from 'proj4';
import {createProvisionalNetwork,findProvisionalRoute} from '../src/provisional-network.mjs';
import {createOfficialConditionIndex} from '../src/official-conditions.mjs';

const twd='+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs';
const ll=p=>{const [lon,lat]=proj4(twd,'EPSG:4326',p);return [lat,lon];};
const xy=p=>proj4('EPSG:4326',twd,[p[1],p[0]]);
const hash='a'.repeat(64);
function snapshot(works=[]){const t=new Date().toISOString();return {schemaVersion:1,fetchedAt:t,sourceUpdatedAt:t,works};}
function fixture(gap=2){
 const a=[303000,2778000],b=[303100,2778000],bl=ll(b),c=xy([bl[0],bl[1]+gap/100700]),d=[c[0]+100,c[1]];
 const parts=[{qgsFid:'1',partIndex:0,coordinates:[a,b]},{qgsFid:'2',partIndex:0,coordinates:[c,d]}];
 const area={type:'Polygon',coordinates:[[[121.52,25.10],[121.54,25.10],[121.54,25.12],[121.52,25.12],[121.52,25.10]]]};
 const graph={officialPathEvidence:{schemaVersion:2},officialAreas:[area],officialCrossingAreas:[],roadGeometries:[[[121.79,25],[121.79,25.01]]],nodes:[],ways:[],edges:[]};
 return {parts,graph,start:ll(a),end:ll(d),sourceHash:hash,osmEdgeIds:[],facilities:[],places:[],snapshot:snapshot(),join:[ll(b),ll(c)]};
}
test('source endpoint joins include 2m but reject greater gaps, and remain explicitly unconfirmed',()=>{
 const f=fixture(2),r=findProvisionalRoute(f);assert.equal(r.error,undefined);assert.equal(r.kind,'official-passageway');assert.equal(r.verification,'pending-source-validation');assert.equal(r.navigationAllowed,false);assert.equal('geometryVerification' in r,false);
 assert.deepEqual(r.coordinates[0],f.start);assert.deepEqual(r.coordinates.at(-1),f.end);assert.ok(r.steps.length>0);assert.ok(r.steps.every(s=>Number.isFinite(s.lat)&&Number.isFinite(s.lon)&&Number.isFinite(s.distance)));assert.equal(r.construction.blocked.length,0);
 const join=r.segments.find(s=>s.kind==='source-join');assert.ok(join);assert.ok(join.gapMetres<=2+1e-7);assert.equal(join.topology,'unconfirmed');assert.equal(join.grade,'unknown');
 assert.ok(r.segments.filter(s=>s.kind==='official-line').every(s=>s.qgsFid&&s.grade==='unknown'&&s.barrier==='unknown'));assert.equal(r.endpointAccess,'unconfirmed');
 assert.equal(findProvisionalRoute(fixture(2.01)).error,'NO_PROVISIONAL_ROUTE');
});
test('known vehicle crossing, blocked node and active construction each prevent a proposed join',()=>{
 const road=fixture(2),mid=[(road.join[0][0]+road.join[1][0])/2,(road.join[0][1]+road.join[1][1])/2];
 road.graph.roadGeometries=[[[mid[1],mid[0]-.0002],[mid[1],mid[0]+.0002]]];assert.equal(findProvisionalRoute(road).error,'NO_PROVISIONAL_ROUTE');
 const blocked=fixture(2),p=blocked.join[0];blocked.graph.nodes.push([p[0],p[1],1,1]);assert.match(findProvisionalRoute(blocked).error,/^NO_PROVISIONAL_(ROUTE|CONNECTION)$/);
 const works=fixture(2);works.snapshot=snapshot([{id:'closure',impact:'blocked',start:'',end:'',hours:'24小時',geometries:[{type:'Point',coordinates:[works.join[0]]}]}]);assert.match(findProvisionalRoute(works).error,/^NO_PROVISIONAL_(ROUTE|CONNECTION)$/);
});
test('declared bridges, tunnels, non-ground levels and blocked source lines never become tentative joins',()=>{
 for(const patch of [{bridge:'yes'},{tunnel:'yes'},{layer:'1'},{level:'-1'},{blocked:true}]){const f=fixture(2);Object.assign(f.parts[1],patch);assert.equal(findProvisionalRoute(f).error,'NO_PROVISIONAL_CONNECTION');}
});
test('source identity is retained and identical part identities are rejected',()=>{
 const f=fixture(1);f.parts[1].qgsFid='1';f.parts[1].partIndex=1;
 const r=findProvisionalRoute(f);assert.equal(r.error,undefined);assert.ok(r.segments.some(s=>s.qgsFid==='1'&&s.partIndex===1));
 f.parts[1].partIndex=0;assert.equal(findProvisionalRoute(f).error,'INVALID_PROVISIONAL_INPUT');
});
test('a reusable network returns only tentative candidates and refuses stale data',()=>{
 const f=fixture(1),network=createProvisionalNetwork(f);assert.equal(network.kind,'provisional-network');
 const first=network.findRoute(f.start,f.end),second=network.findRoute(f.start,f.end);assert.equal(first.error,undefined);assert.equal(second.error,undefined);assert.equal(first.distanceMetres,second.distanceMetres);
 f.snapshot.sourceUpdatedAt='2000-01-01T00:00:00Z';assert.equal(network.findRoute(f.start,f.end).error,'CONSTRUCTION_UNAVAILABLE');
});
test('source to OSM joins are bounded and never join a known bridge or disregard width filters',()=>{
 const f=fixture(100),a=f.join[0],b=f.join[1],proof={schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
 f.graph.nodes=[[...a,0,1],[...b,0,2]];f.graph.ways=[{highway:'footway',width:1.5,slope:0}];f.graph.edges=[[0,1,100,0,[],proof]];f.osmEdgeIds=[0];
 const r=findProvisionalRoute(f);assert.equal(r.error,undefined);assert.ok(r.segments.some(s=>s.kind==='osm'&&s.edgeId===0));assert.ok(r.segments.some(s=>s.kind==='osm-join'&&s.osmEdgeId===0&&s.topology==='unconfirmed'));
 for(const prop of [{bridge:'yes'},{tunnel:'yes'},{layer:'1'}]){const original=f.graph.ways[0];f.graph.ways[0]={...original,...prop};assert.equal(findProvisionalRoute(f).error,'NO_PROVISIONAL_ROUTE');f.graph.ways[0]=original;}
 assert.equal(findProvisionalRoute({...f,routingOptions:{minWidth:2}}).error,'NO_PROVISIONAL_ROUTE');
 assert.equal(findProvisionalRoute({...f,routingOptions:{knownOnly:true}}).error,'NO_PROVISIONAL_CONNECTION');
});
test('source to OSM separation is inclusive at 2m and rejects greater gaps',()=>{
 const f=fixture(100),a=f.join[0],b=f.join[1],proof={schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
 const offset=m=>{f.graph.nodes=[[a[0]+m/111195,a[1],0,1],[b[0]+m/111195,b[1],0,2]];};
 f.graph.ways=[{highway:'footway',width:1.5,slope:0}];f.graph.edges=[[0,1,100,0,[],proof]];f.osmEdgeIds=[0];
 offset(2);const within=findProvisionalRoute(f);assert.equal(within.error,undefined);assert.ok(within.segments.some(s=>s.kind==='osm-join'&&s.gapMetres>1.99&&s.gapMetres<=2+1e-7));
 offset(2.01);assert.equal(findProvisionalRoute(f).error,'NO_PROVISIONAL_ROUTE');
});
test('input and search bounds fail explicitly without returning a route',()=>{
 const f=fixture(1);assert.equal(findProvisionalRoute({...f,limits:{maxVertices:2}}).error,'PROVISIONAL_SEARCH_LIMIT');
 assert.equal(findProvisionalRoute({...f,limits:{maxParts:1}}).error,'INVALID_PROVISIONAL_INPUT');
 const malformed=fixture(1);malformed.parts[0].coordinates[0]=[NaN,2778000];assert.equal(findProvisionalRoute(malformed).error,'INVALID_PROVISIONAL_INPUT');
 assert.equal(findProvisionalRoute({...f,facilities:undefined}).error,'PROVISIONAL_ENDPOINT_DATA_UNAVAILABLE');
});
test('explicitly inaccessible or upstairs endpoints cannot be bypassed by provisional geometry',()=>{
 const f=fixture(1),[lat,lon]=f.end,p={id:'osm-n123',sourceId:'osm',osmRestrictionsMatched:true,kind:'place',lat,lon,access:'private'};
 f.places=[p];assert.equal(findProvisionalRoute({...f,endPlace:p}).error,'OFFICIAL_ENTRY_UNVERIFIED');
 const upstairs={...p,access:'yes',level:'1'};f.places=[upstairs];assert.equal(findProvisionalRoute({...f,endPlace:upstairs}).error,'OFFICIAL_ENTRY_UNVERIFIED');
});
test('multiple projections on one OSM edge preserve the real intermediate bends in either direction',()=>{
 const n=(x,y)=>[25.11+y/111195,121.53+x/100700],f=fixture(),proof={schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
 const bend1=n(100,0),bend2=n(100,100);
 f.graph.nodes=[[...n(0,0),0,1],[...n(200,100),0,2]];f.graph.ways=[{highway:'footway',width:2,slope:0}];f.graph.edges=[[0,1,300,0,[bend1,bend2],proof]];f.osmEdgeIds=[0];
 f.parts=[{qgsFid:'101',partIndex:0,coordinates:[xy(n(80,-40)),xy(n(80,-.5))]},{qgsFid:'102',partIndex:0,coordinates:[xy(n(180,100.5)),xy(n(180,140))]},{qgsFid:'103',partIndex:0,coordinates:[xy(n(100.5,50)),xy(n(120,50))]}];
 const start=n(80,-40),end=n(180,140);
 for(const [a,b] of [[start,end],[end,start]]){
  const result=findProvisionalRoute({...f,start:a,end:b});assert.equal(result.error,undefined);assert.ok(Math.abs(result.distanceMetres-280)<1);
  const osm=result.segments.filter(s=>s.kind==='osm'),coords=osm.flatMap(s=>s.coordinates);assert.ok(coords.some(p=>Math.hypot(p[0]-bend1[0],p[1]-bend1[1])<1e-9));assert.ok(coords.some(p=>Math.hypot(p[0]-bend2[0],p[1]-bend2[1])<1e-9));
  assert.ok(result.segments.filter(s=>s.kind==='osm-join').every(s=>s.gapMetres<=2+1e-7&&s.topology==='unconfirmed'));
 }
 const work={id:'blocked',impact:'blocked',start:'',end:'',hours:'24小時',geometries:[{type:'Point',coordinates:[n(100,50)]}]};
 assert.equal(findProvisionalRoute({...f,start,end,snapshot:snapshot([work])}).error,'NO_PROVISIONAL_ROUTE');
 f.graph.edges[0][5]={...proof,roadCrossingVerified:false};assert.equal(findProvisionalRoute({...f,start,end}).error,'NO_PROVISIONAL_ROUTE');
});
test('explicit avoided points conservatively exclude nearby source, OSM and endpoint geometry without claiming closure',()=>{
 const f=fixture(100),a=f.join[0],b=f.join[1],proof={schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
 f.graph.nodes=[[...a,0,1],[...b,0,2]];f.graph.ways=[{highway:'footway',width:2,slope:0}];f.graph.edges=[[0,1,100,0,[],proof]];f.osmEdgeIds=[0];
 const baseline=findProvisionalRoute(f);assert.equal(baseline.error,undefined);assert.equal(baseline.unknownRoadArea,true);assert.equal(baseline.unknownRoadSide,true);
 const midpoint=[(a[0]+b[0])/2,(a[1]+b[1])/2];assert.equal(findProvisionalRoute({...f,routingOptions:{avoidPoints:[midpoint]}}).error,'NO_PROVISIONAL_ROUTE');
 assert.match(findProvisionalRoute({...f,routingOptions:{avoidPoints:[f.start]}}).error,/^NO_PROVISIONAL_(ROUTE|CONNECTION)$/);
 const distant=findProvisionalRoute({...f,routingOptions:{avoidPoints:[[25.2,121.7]]}});assert.equal(distant.error,undefined);assert.equal(distant.avoidPointsPolicy,'conservative-exclusion-25m');
});
function alternatives(){
 const f=fixture(),n=(x,y)=>[25.11+y/111195,121.53+x/100700],poly=[n(-5,25),n(305,25),n(305,35),n(-5,35),n(-5,25)].map(([lat,lon])=>[lon,lat]);
 f.graph.officialAreas=[{type:'Polygon',coordinates:[poly]}];f.parts=[
  {qgsFid:'201',partIndex:0,coordinates:[xy(n(0,0)),xy(n(150,0)),xy(n(300,0))]},
  {qgsFid:'202',partIndex:0,coordinates:[xy(n(0,0)),xy(n(0,30)),xy(n(150,30)),xy(n(300,30)),xy(n(300,0))]},
 ];f.start=n(0,0);f.end=n(300,0);return f;
}
test('bounded rounds retain the shortest baseline and compare distinct routes using recorded evidence',()=>{
 const f=alternatives(),original=JSON.stringify({nodes:f.graph.nodes,edges:f.graph.edges}),network=createProvisionalNetwork(f);
 const result=network.findCandidates(f.start,f.end,{totalMs:5000});assert.equal(result.error,undefined);assert.equal(result.kind,'provisional-comparison');assert.equal(result.navigationAllowed,false);assert.equal(result.scoreMeaning,'comparison-only-not-accessibility');
 assert.equal(result.candidates[0].id,'shortest');assert.ok(Math.abs(result.shortestDistanceMetres-300)<1);assert.ok(result.candidates.length>=2);
 assert.ok(result.candidates.every(c=>c.route.navigationAllowed===false&&c.route.verification==='pending-source-validation'&&c.route.distanceMetres<=result.maxDistanceMetres+1e-7));
 assert.ok(result.candidates.every(c=>Number.isFinite(c.score)&&Number.isFinite(c.scoreBreakdown.unknown)&&c.coverage.unknownMetres>0));
 assert.ok(result.candidates.some(c=>c.coverage.officialAreaMetres>result.candidates[0].coverage.officialAreaMetres));
 assert.equal(JSON.stringify({nodes:f.graph.nodes,edges:f.graph.edges}),original);
});
test('a limited comparison keeps its independently complete baseline and rejects stale data',()=>{
 const f=alternatives(),network=createProvisionalNetwork(f),base=network.findRoute(f.start,f.end),result=network.findCandidates(f.start,f.end,{totalMs:5000,maxVisitedTotal:base.search.visited});
 assert.equal(result.status,'incomplete');assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].id,'shortest');assert.equal(result.candidates[0].route.navigationAllowed,false);
 f.snapshot.sourceUpdatedAt='2000-01-01T00:00:00Z';assert.equal(network.findCandidates(f.start,f.end).error,'CONSTRUCTION_UNAVAILABLE');
 assert.equal(network.findCandidates(f.start,f.end,{maxRounds:999}).error,'INVALID_PROVISIONAL_INPUT');
});
test('deadline and grid-entry limits stop oversized single parts explicitly',()=>{
 const f=fixture(),points=Array.from({length:60000},(_,i)=>[303000+i*.001,2778000]);
 const result=createProvisionalNetwork({...f,parts:[{qgsFid:'1',partIndex:0,coordinates:points}],limits:{maxMs:10}});
 assert.equal(result.error,'PROVISIONAL_SEARCH_LIMIT');assert.equal(result.navigationAllowed,false);
 assert.equal(createProvisionalNetwork({...f,limits:{maxGridEntries:1}}).error,'PROVISIONAL_SEARCH_LIMIT');
});
test('comparison scores nearby official records and reports missing records as unknown',()=>{
 const f=fixture(1),p=ll([303050,2778000]),index=createOfficialConditionIndex({schemaVersion:1,fetchedAt:new Date().toISOString(),points:[{id:'1',type:'missing_noCurbSlope',lat:p[0],lon:p[1],activity:'活動區域分類-高'}]});
 f.graph.officialConditionIndex=index;const withData=createProvisionalNetwork(f).findCandidates(f.start,f.end);
 assert.equal(withData.candidates[0].coverage.officialConditionWeight,3);assert.equal(withData.candidates[0].scoreBreakdown.officialConditions,-3);
 delete f.graph.officialConditionIndex;const unknown=createProvisionalNetwork(f).findCandidates(f.start,f.end);
 assert.equal(unknown.candidates[0].coverage.officialConditionWeight,null);assert.equal(unknown.candidates[0].scoreBreakdown.officialConditions,-2);
});
