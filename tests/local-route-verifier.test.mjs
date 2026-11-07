import test from 'node:test';import assert from 'node:assert/strict';
import{createRouter}from'../src/routing.mjs';import{createLocalRouteVerifier,stationEntrances,planPlaces}from'../src/local-route-verifier.mjs';
import{routeAroundConstruction}from'../src/construction-routing.mjs';
import{createConstructionChecker}from'../src/construction.mjs';
const a=[25,121.5],b=[25,121.501],proof={schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
const base=()=>({officialPathEvidence:{schemaVersion:2},nodes:[[...a,0],[...b,0]],ways:[{highway:'footway',width:2,slope:0}],edges:[[0,1,100,0,[],proof]],officialAreas:[],officialCrossingAreas:[],roadGeometries:[[[121.51,25],[121.51,25.01]]]});
test('mapped footway provenance replaces an unrelated full-city polygon coverage requirement',()=>{const g=base(),r=createRouter(g)(a,b);const v=createLocalRouteVerifier(g)(r,a,b);assert.equal(v.error,undefined);assert.equal(v.geometryVerification,'pedestrian-network-v1');});
test('sidewalk markers use verified way data and split when the tag changes',()=>{
 const g=base(),middle=[25,121.5005];g.nodes=[[...a,0],[...middle,0],[...b,0]];
 g.ways=[{highway:'footway',footway:'sidewalk',width:2,slope:0},{highway:'footway',width:2,slope:0}];g.edges=[[0,1,50,0,[],proof],[1,2,50,1,[],proof]];
 const r=createRouter(g)(a,b);r.tierSegments=[{explicitSidewalk:true,coordinates:[a,b]}];
 const v=createLocalRouteVerifier(g)(r,a,b);
 assert.equal(v.error,undefined);assert.deepEqual(v.tierSegments.map(s=>s.explicitSidewalk),[true,false]);
 assert.deepEqual(v.tierSegments.map(s=>s.coordinates),[[a,middle],[middle,b]]);
});
test('revalidating a route reconstructs network distance without counting an approach twice',()=>{
 const g=base(),p=[25+30/111195,121.5],exit={id:'exit',kind:'metro-elevator',lat:p[0],lon:p[1]},v=createLocalRouteVerifier(g,[exit]),raw=createRouter(g)(a,b),opts={startPlace:exit};
 const first=v(raw,p,b,opts),second=v({...first,coordinates:first.networkCoordinates,distance:9999},p,b,opts);
 assert.equal(first.error,undefined);assert.equal(second.error,undefined);assert.equal(first.distance,130);assert.equal(second.distance,130);
});
test('forged geometry and vehicle way cannot inherit pedestrian verification',()=>{const g=base(),r=createRouter(g)(a,b);assert.equal(createLocalRouteVerifier(g)({...r,coordinates:[a,[25.01,121.5],b]},a,b).error,'UNVERIFIED_NETWORK');g.ways[0].highway='primary';assert.equal(createLocalRouteVerifier(g)(r,a,b).error,'UNVERIFIED_NETWORK');});
test('unknown point near the network does not gain an invented connector',()=>{const g=base(),r=createRouter(g)(a,b),p=[25.00005,121.5];assert.equal(createLocalRouteVerifier(g)(r,p,b).error,'OFFICIAL_ENTRY_UNVERIFIED');});
test('short registered metro exit approach is labelled estimated and checks its entire road crossing',()=>{const g=base(),r=createRouter(g)(a,b),p=[25.00005,121.5],exit={id:'exit',kind:'metro-elevator',lat:p[0],lon:p[1]};const v=createLocalRouteVerifier(g,[exit])(r,p,b,{startPlace:exit});assert.equal(v.approaches[0].estimated,true);g.roadGeometries=[[[121.499,25.000025],[121.502,25.000025]]];assert.equal(createLocalRouteVerifier(g,[exit])(r,p,b,{startPlace:exit}).error,'OFFICIAL_ENTRY_UNVERIFIED');});
test('registered exit estimate extends to 50m but remains unknown and cannot be forged',()=>{
 const g=base(),r=createRouter(g)(a,b),p=[25+30/111195,121.5],exit={id:'exit',kind:'metro-elevator',lat:p[0],lon:p[1]},verify=createLocalRouteVerifier(g,[exit]);
 const v=verify(r,p,b,{startPlace:exit});assert.equal(v.error,undefined);assert.equal(v.approaches[0].estimated,true);assert.equal(v.approaches[0].distance,30);
 assert.equal(verify(r,p,b,{startPlace:exit,knownOnly:true}).error,'OFFICIAL_ENTRY_UNVERIFIED');
 assert.equal(verify.approachAllowed(p,a,exit,{knownOnly:true}),false);
 assert.equal(verify(r,p,b,{startPlace:{...exit,id:'other'}}).error,'OFFICIAL_ENTRY_UNVERIFIED');
 assert.equal(verify(r,[p[0]+.000001,p[1]],b,{startPlace:exit}).error,'OFFICIAL_ENTRY_UNVERIFIED');
 const distant=[25+51/111195,121.5],far={...exit,lat:distant[0]};assert.equal(createLocalRouteVerifier(g,[far])(r,distant,b,{startPlace:far}).error,'OFFICIAL_ENTRY_UNVERIFIED');
});
test('estimated metro approach still refuses an unverified vehicle crossing',()=>{
 const g=base(),r=createRouter(g)(a,b),p=[25+30/111195,121.5],exit={id:'exit',kind:'metro-elevator',lat:p[0],lon:p[1]};
 g.roadGeometries=[[[121.499,25+15/111195],[121.502,25+15/111195]]];
 assert.equal(createLocalRouteVerifier(g,[exit])(r,p,b,{startPlace:exit}).error,'OFFICIAL_ENTRY_UNVERIFIED');
});
test('estimated exit links obey construction blocking and known-only during search',()=>{
 const g=base(),p=[25+30/111195,121.5],exit={id:'exit',kind:'metro-elevator',lat:p[0],lon:p[1]},fac=[exit];
 const now=Date.parse('2026-11-07T08:00:00Z'),stamp=new Date(now).toISOString(),snapshot={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]};
 const run=(options,works=[])=>{const s={...snapshot,works};return planPlaces(exit,{lat:b[0],lon:b[1]},options,s,{router:createRouter(g),verifyLocal:createLocalRouteVerifier(g,fac),facilities:fac,checker:createConstructionChecker(s,now)});};
 const result=run({});assert.equal(result.error,undefined);assert.equal(result.approaches[0].estimated,true);
 assert.ok(run({knownOnly:true}).error);
 const closure={id:'closed',start:'115/11/07',end:'115/11/07',hours:'24小時施工',impact:'blocked',geometries:[{type:'Point',coordinates:[p]}]};
 const blocked=run({},[closure]);assert.equal(blocked.error,'CONSTRUCTION_BLOCKED');assert.equal(blocked.coordinates,undefined);
});
test('registered POI estimates require exact id, coordinate and permitted source data',()=>{
 const g=base(),r=createRouter(g)(a,b),p=[25+30/111195,121.5],poi={id:'poi',kind:'health',name:'診所',lat:p[0],lon:p[1]},verify=createLocalRouteVerifier(g,[],[poi]);
 const result=verify(r,p,b,{startPlace:poi});assert.equal(result.error,undefined);assert.equal(result.approaches[0].estimated,true);assert.equal(result.approaches[0].distance,30);
 assert.equal(verify(r,p,b,{startPlace:{...poi,id:'forged'}}).error,'OFFICIAL_ENTRY_UNVERIFIED');
 assert.equal(verify(r,[p[0]+.000001,p[1]],b,{startPlace:poi}).error,'OFFICIAL_ENTRY_UNVERIFIED');
 assert.equal(verify(r,p,b,{startPlace:poi,knownOnly:true}).error,'OFFICIAL_ENTRY_UNVERIFIED');
 const distant=[25+51/111195,121.5],far={...poi,lat:distant[0]};assert.equal(createLocalRouteVerifier(g,[],[far])(r,distant,b,{startPlace:far}).error,'OFFICIAL_ENTRY_UNVERIFIED');
 for(const patch of [{access:'no'},{access:'private'},{access:'customers'},{foot:'no'},{foot:'use_sidepath'},{wheelchair:'no'},{'foot:conditional':'no @ night'},{'foot:forward':'no'},{'access:forward':'private'},{'oneway:foot':'yes'},{'wheelchair:conditional':'no @ night'},{barrier:'gate'},{kerb:'raised'},{'kerb:height':'0.05'},{'door:locked':'yes'}]){
  const blocked={...poi,...patch},v=createLocalRouteVerifier(g,[],[blocked]);assert.equal(v(r,p,b,{startPlace:poi}).error,'OFFICIAL_ENTRY_UNVERIFIED');assert.equal(v.approachAllowed(p,p,poi),false);
 }
 const road={...poi,kind:'road'};assert.equal(createLocalRouteVerifier(g,[],[road])(r,p,b,{startPlace:road}).error,'OFFICIAL_ENTRY_UNVERIFIED');
 const different={...poi,lat:p[0]+.00001};assert.equal(createLocalRouteVerifier(g,[],[poi,different])(r,p,b,{startPlace:poi}).error,'OFFICIAL_ENTRY_UNVERIFIED');
 const restrictedDuplicate={...poi,access:'private'};assert.equal(createLocalRouteVerifier(g,[],[poi,restrictedDuplicate])(r,p,b,{startPlace:poi}).error,'OFFICIAL_ENTRY_UNVERIFIED');
});
test('registered restrictions cannot be bypassed using forged ids, same-coordinate aliases or zero-gap snapping',()=>{
 const g=base(),p=a,closed={id:'closed',kind:'place',lat:p[0],lon:p[1],access:'private'},alias={id:'alias',kind:'place',lat:p[0],lon:p[1]},exit={id:'exit',kind:'metro-elevator',lat:p[0],lon:p[1]};
 const verifier=createLocalRouteVerifier(g,[exit],[closed,alias]),candidate=createRouter(g)(a,b);
 for(const place of [closed,alias,exit,{...alias,id:'forged'},null]){
  assert.equal(verifier.approachAllowed(p,p,place),false);
  assert.equal(verifier(candidate,p,b,{startPlace:place}).error,'OFFICIAL_ENTRY_UNVERIFIED');
 }
 // A genuine known ID with altered coordinates cannot fall through to a
 // zero-gap or covered-connector case either.
 const open={id:'open',kind:'place',lat:25.0001,lon:121.5},v=createLocalRouteVerifier(g,[],[open]);
 assert.equal(v.approachAllowed(a,a,{...open,lat:a[0]}),false);
});
test('OSM POI estimate requires a verified source match; non-OSM sources remain explicitly estimated',()=>{
 const g=base(),p=[25+30/111195,121.5],r=createRouter(g)(a,b),osm={id:'osm-n123',kind:'park',sourceId:'osm',lat:p[0],lon:p[1]};
 for(const match of [undefined,false]){const point={...osm,osmRestrictionsMatched:match},v=createLocalRouteVerifier(g,[],[point]);assert.equal(v(r,p,b,{startPlace:point}).error,'OFFICIAL_ENTRY_UNVERIFIED');}
 const matched={...osm,osmRestrictionsMatched:true},result=createLocalRouteVerifier(g,[],[matched])(r,p,b,{startPlace:matched});
 assert.equal(result.error,undefined);assert.equal(result.approaches[0].estimated,true);
 const official={id:'official-1',kind:'park',sourceId:'wheel',lat:p[0],lon:p[1]};assert.equal(createLocalRouteVerifier(g,[],[official])(r,p,b,{startPlace:official}).approaches[0].estimated,true);
 const sharedLocation=createLocalRouteVerifier(g,[official],[{...osm,osmRestrictionsMatched:false}]);
 assert.equal(sharedLocation(r,p,b,{startPlace:official}).error,'OFFICIAL_ENTRY_UNVERIFIED');
});
test('explicit GPS and map starts may connect with a machine-readable unconfirmed estimate',()=>{
 const g=base(),p=[25+30/111195,121.5],candidate=createRouter(g)(a,b),v=createLocalRouteVerifier(g);
 const sources=[{id:'point-123',originKind:'map',lat:p[0],lon:p[1]},
  {id:'my-location',originKind:'gps',locationSource:'browser',accuracy:20,needsConfirmation:false,lat:p[0],lon:p[1]},
  {id:'my-location',originKind:'gps',locationSource:'browser',accuracy:800,needsConfirmation:true,lat:p[0],lon:p[1]},
  {id:'my-location',originKind:'gps',locationSource:'townpass',accuracy:null,needsConfirmation:true,lat:p[0],lon:p[1]}];
 for(const place of sources){const result=v(candidate,p,b,{startPlace:place});assert.equal(result.error,undefined);assert.equal(result.approaches[0].estimated,true);assert.equal(result.approaches[0].unconfirmed,true);assert.equal(result.approaches[0].entryStatus,'unconfirmed');assert.equal(result.approaches[0].originKind,place.originKind);assert.equal(result.approaches[0].distance,30);}
});
test('map estimate is symmetric, GPS is start-only, and restrictions are retained',()=>{
 const g=base(),p=[25+30/111195,121.5],v=createLocalRouteVerifier(g),map={id:'point-123',originKind:'map',lat:p[0],lon:p[1]},gps={id:'my-location',originKind:'gps',locationSource:'browser',accuracy:20,needsConfirmation:false,lat:p[0],lon:p[1]};
 assert.equal(v.approachAllowed(p,a,map,{},'start'),true);assert.equal(v.approachAllowed(p,a,map,{},'end'),true);assert.equal(v.approachAllowed(p,a,gps,{},'end'),false);
 assert.equal(v.approachAllowed(p,a,map,{knownOnly:true},'start'),false);
 const covered=base();covered.officialAreas=[{type:'Polygon',coordinates:[[[121.49,24.99],[121.51,24.99],[121.51,25.01],[121.49,25.01],[121.49,24.99]]]}];
 assert.equal(createLocalRouteVerifier(covered).approachAllowed(p,a,map,{knownOnly:true},'start'),false);
 for(const bad of [{...gps,accuracy:-1},{...gps,accuracy:NaN},{...gps,locationSource:'invented'},{...gps,id:'osm-n123'},{...map,kind:'place'},{...map,sourceId:'osm'},{...map,id:'osm-n123'},{...map,foot:'no'},{...map,level:'2'}])assert.equal(v.approachAllowed(p,a,bad,{},'start'),false,JSON.stringify(bad));
 const far={...map,lat:25+51/111195};assert.equal(v.approachAllowed([far.lat,far.lon],a,far,{},'start'),false);
});
test('GPS and map starts cannot bypass recorded prohibited, upstairs or unmatched OSM points',()=>{
 const g=base(),p=[25+30/111195,121.5],map={id:'point-123',originKind:'map',lat:p[0],lon:p[1]};
 for(const known of [{id:'osm-n1',sourceId:'osm',kind:'place',lat:p[0],lon:p[1],access:'private',osmRestrictionsMatched:true},{id:'osm-n2',sourceId:'osm',kind:'toilet',lat:p[0],lon:p[1],name:'2F廁所',osmRestrictionsMatched:true},{id:'osm-n3',sourceId:'osm',kind:'place',lat:p[0],lon:p[1],osmRestrictionsMatched:false}]){
  assert.equal(createLocalRouteVerifier(g,[],[known]).approachAllowed(p,a,map,{},'start'),false);
 }
 const covered=base();covered.officialAreas=[{type:'Polygon',coordinates:[[[121.49,24.99],[121.51,24.99],[121.51,25.01],[121.49,25.01],[121.49,24.99]]]}];
 const unmatched={id:'osm-n3',sourceId:'osm',kind:'place',lat:p[0],lon:p[1],osmRestrictionsMatched:false},cv=createLocalRouteVerifier(covered,[],[unmatched]);
 assert.equal(cv.endpointAllowed(p,map,'start'),false);assert.equal(cv.approachAllowed(p,a,map,{},'start'),false);
 g.roadGeometries=[[[121.499,25+15/111195],[121.502,25+15/111195]]];assert.equal(createLocalRouteVerifier(g).approachAllowed(p,a,map,{},'start'),false);
});
test('map start estimate still observes active construction',()=>{
 const g=base(),p=[25+30/111195,121.5],start={id:'point-123',originKind:'map',lat:p[0],lon:p[1]},end={lat:b[0],lon:b[1]};
 const now=Date.parse('2026-11-07T08:00:00Z'),stamp=new Date(now).toISOString(),works=[{id:'closed',start:'115/11/07',end:'115/11/07',hours:'24小時施工',impact:'blocked',geometries:[{type:'Point',coordinates:[p]}]}],snapshot={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works};
 const result=planPlaces(start,end,{},snapshot,{router:createRouter(g),verifyLocal:createLocalRouteVerifier(g),facilities:[],checker:createConstructionChecker(snapshot,now)});
 assert.equal(result.error,'CONSTRUCTION_BLOCKED');assert.equal(result.coordinates,undefined);
});
test('two user-selected map points independently connect to the walking network',()=>{
 const g=base(),start={id:'point-101',originKind:'map',lat:25+10/111195,lon:121.5},end={id:'point-102',originKind:'map',lat:25+10/111195,lon:121.501};
 const stamp=new Date().toISOString(),snapshot={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]};
 const result=planPlaces(start,end,{},snapshot,{router:createRouter(g),verifyLocal:createLocalRouteVerifier(g),facilities:[],checker:createConstructionChecker(snapshot)});
 assert.equal(result.error,undefined);assert.deepEqual(result.approaches.filter(x=>x.originKind==='map').map(x=>x.side),['start','end']);
 assert.ok(result.approaches.every(x=>x.estimated&&x.entryStatus==='unconfirmed'));
});
test('edge projection cannot skip a closer blocked node for a map start',()=>{
 const g=base(),middle=121.5005,p=[25+20/111195,middle],start={id:'point-123',originKind:'map',lat:p[0],lon:p[1]};
 g.nodes.push([25+10/111195,middle,1]);const v=createLocalRouteVerifier(g),route=createRouter(g);
 const result=route(p,b,{approachAllowed:(x,y,side)=>v.approachAllowed(x,y,side==='start'?start:null,{},side)});
 assert.equal(result.error,'NO_CONNECTION');assert.ok(g.nodes.length>3,'projection was considered but must not bypass the closer blocked point');
});
test('upper, underground or unlocated indoor POIs cannot become ground-level connectors through aliases',()=>{
 const g=base(),p=[25+30/111195,121.5],r=createRouter(g)(a,b),poi={id:'osm-n123',kind:'toilet',sourceId:'osm',osmRestrictionsMatched:true,lat:p[0],lon:p[1],name:'廁所'};
 for(const patch of [{level:'1'},{level:'-1'},{level:'0;1'},{level:'unknown'},{'addr:level':'2'},{'addr:floor':'2'},
  {'level:ref':'B1'},{repeat_on:'0;1'},{layer:'1'},{indoor:'yes'},{building:'yes'},
  {location:'underground'},{name:'2F廁所'},{description:'2F'},{name:'地下一樓廁所'},{name:'公園二樓廁所'}]){
  const source={...poi,...patch},alias={id:'alias',kind:'toilet',lat:p[0],lon:p[1]},v=createLocalRouteVerifier(g,[alias],[source]);
  for(const place of [source,alias,{...alias,id:'forged'}]){
   assert.equal(v.approachAllowed(p,p,place),false,JSON.stringify(patch));
   assert.equal(v(r,p,b,{startPlace:place}).error,'OFFICIAL_ENTRY_UNVERIFIED',JSON.stringify(patch));
  }
 }
 for(const patch of [{},{indoor:'yes',level:'0'},{indoor:'yes',name:'1F廁所'},{location:'surface'}]){
  const source={...poi,...patch},result=createLocalRouteVerifier(g,[],[source])(r,p,b,{startPlace:source});
  assert.equal(result.error,undefined,JSON.stringify(patch));assert.equal(result.approaches[0].estimated,true);
 }
});
test('local first-floor address labels permit only an unconfirmed approach and never override restrictions',()=>{
 const g=base(),p=[25+30/111195,121.5],raw=createRouter(g)(a,b),poi={id:'osm-n123',kind:'place',sourceId:'osm',osmRestrictionsMatched:true,lat:p[0],lon:p[1],name:'店家'};
 for(const label of ['1','1F','一樓','一楼']){
  const place={...poi,'addr:floor':label},v=createLocalRouteVerifier(g,[],[place]),result=v(raw,p,b,{startPlace:place});
  assert.equal(result.error,undefined,label);assert.equal(result.approaches[0].estimated,true);assert.equal(result.approaches[0].entryStatus,'unconfirmed');assert.deepEqual(result.approaches[0].coordinates,[p,a]);
  assert.equal(v.approachAllowed(p,a,place,{knownOnly:true},'start'),false);
 }
 for(const patch of [{level:'1'},{'addr:floor':'2'},{'addr:floor':'B1'},{indoor:'yes'},{building:'yes'},{location:'indoor'},{wheelchair:'no'},{access:'private'},{foot:'no'},{'door:locked':'yes'}]){
  const place={...poi,'addr:floor':'1',...patch},v=createLocalRouteVerifier(g,[],[place]);assert.equal(v.endpointAllowed(p,place,'start'),false,JSON.stringify(patch));
 }
 const unmatched={...poi,'addr:floor':'1',osmRestrictionsMatched:false};assert.equal(createLocalRouteVerifier(g,[],[unmatched]).approachAllowed(p,a,unmatched,{},'start'),false);
 const samePoint={...poi,lat:a[0],lon:a[1],'addr:floor':'1'},sameVerifier=createLocalRouteVerifier(g,[],[samePoint]);
 const zero=sameVerifier(raw,a,b,{startPlace:samePoint});assert.equal(zero.error,undefined);assert.equal(zero.approaches[0].distance,0);assert.equal(zero.approaches[0].entryStatus,'unconfirmed');assert.equal(sameVerifier.approachAllowed(a,a,samePoint,{knownOnly:true},'start'),false);
 const covered=base();covered.officialAreas=[{type:'Polygon',coordinates:[[[121.49,24.99],[121.51,24.99],[121.51,25.01],[121.49,25.01],[121.49,24.99]]]}];
 const coveredResult=createLocalRouteVerifier(covered,[],[{...poi,'addr:floor':'1'}])(raw,p,b,{startPlace:{...poi,'addr:floor':'1'}});assert.equal(coveredResult.error,undefined);assert.equal(coveredResult.approaches[0].estimated,true);assert.equal(coveredResult.approaches[0].entryStatus,'unconfirmed');
 const crossing=base();crossing.roadGeometries=[[[121.499,25+15/111195],[121.502,25+15/111195]]];const place={...poi,'addr:floor':'1'};
 assert.equal(createLocalRouteVerifier(crossing,[],[place]).approachAllowed(p,a,place,{},'start'),false);
 const stamp=new Date().toISOString(),snapshot={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[{id:'blocked',start:'',end:'',hours:'24小時',impact:'blocked',geometries:[{type:'Point',coordinates:[p]}]}]};
 assert.equal(planPlaces(place,{lat:b[0],lon:b[1]}, {},snapshot,{graph:g,router:createRouter(g),verifyLocal:createLocalRouteVerifier(g,[],[place]),facilities:[],checker:createConstructionChecker(snapshot)}).error,'CONSTRUCTION_BLOCKED');
});
test('POI estimated approach cannot cross vehicle way or active construction',()=>{
 const g=base(),p=[25+30/111195,121.5],poi={id:'poi',kind:'park',lat:p[0],lon:p[1]},r=createRouter(g)(a,b);
 g.roadGeometries=[[[121.499,25+15/111195],[121.502,25+15/111195]]];
 assert.equal(createLocalRouteVerifier(g,[],[poi])(r,p,b,{startPlace:poi}).error,'OFFICIAL_ENTRY_UNVERIFIED');
 g.roadGeometries=[[[121.51,25],[121.51,25.01]]];
 const now=Date.parse('2026-11-07T08:00:00Z'),stamp=new Date(now).toISOString(),works=[{id:'closed',start:'115/11/07',end:'115/11/07',hours:'24小時施工',impact:'blocked',geometries:[{type:'Point',coordinates:[p]}]}],snapshot={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works};
 const blocked=planPlaces(poi,{lat:b[0],lon:b[1]},{},snapshot,{router:createRouter(g),verifyLocal:createLocalRouteVerifier(g,[],[poi]),facilities:[],checker:createConstructionChecker(snapshot,now)});
 assert.equal(blocked.error,'CONSTRUCTION_BLOCKED');assert.equal(blocked.coordinates,undefined);
});
test('station search resolves only its own published metro exits',()=>{const fac=[{kind:'metro-elevator',station:'台北車',id:'A'},{kind:'metro-elevator',station:'善導寺',id:'B'}];assert.deepEqual(stationEntrances({kind:'20',name:'臺北車站(R10)'},fac).map(p=>p.id),['A']);});
test('mixed station-entrance failures show connected-but-no-route instead of last no-connection',()=>{
 const exits=[{id:'one',kind:'metro-elevator',station:'文德',name:'入口1',lat:25,lon:121.5},{id:'two',kind:'metro-elevator',station:'文德',name:'入口2',lat:25,lon:121.501}];
 const start={name:'文德(BR18)',kind:'20'},end={lat:25.01,lon:121.51};
 const verify=()=>({error:'UNVERIFIED_NETWORK'});verify.approachAllowed=()=>true;
 const router=(a,b,opts)=>({error:opts.startPlace.id==='one'?'NO_ROUTE':'NO_CONNECTION'});
 const run=facilities=>planPlaces(start,end,{}, {works:[]},{facilities,router,verifyLocal:verify,checker:{allowed:()=>true}});
 for(const facilities of [exits,[...exits].reverse()]){const result=run(facilities);assert.equal(result.error,'NO_ROUTE');assert.deepEqual(result.attemptErrors,{NO_ROUTE:1,NO_CONNECTION:1});}
});
test('unexpected verification failure remains visible when another entrance returns no-route',()=>{
 const facilities=[{id:'one',kind:'metro-elevator',station:'文德',lat:25,lon:121.5},{id:'two',kind:'metro-elevator',station:'文德',lat:25,lon:121.501}];
 const verify=()=>({error:'UNVERIFIED_NETWORK'});verify.approachAllowed=()=>true;
 const router=(a,b,opts)=>opts.startPlace.id==='one'?{error:'NO_ROUTE'}:{coordinates:[]};
 const result=planPlaces({name:'文德',kind:'20'},{lat:25.01,lon:121.51},{},{works:[]},{facilities,router,verifyLocal:verify,checker:{allowed:()=>true}});
 assert.equal(result.error,'UNVERIFIED_NETWORK');assert.deepEqual(result.attemptErrors,{NO_ROUTE:1,UNVERIFIED_NETWORK:1});
});
test('route condition geometry is rebuilt from verified edges, not candidate annotations',()=>{
 const g=base(),r=createRouter(g)(a,b);
 r.tierSegments=[{coordinates:[a,b],sharedRoad:true,unknownWidth:false,unknownSlope:false}];
 r.steps[0].sharedRoad=true;
 g.ways[0].width=null;
 const v=createLocalRouteVerifier(g)(r,a,b);
 assert.equal(v.error,undefined);assert.equal(v.tierSegments[0].sharedRoad,false);
 assert.equal(v.steps[0].sharedRoad,false);
 assert.equal(v.tierSegments[0].unknownWidth,true);assert.deepEqual(v.tierSegments[0].coordinates,[a,b]);
});
test('an exact network endpoint needs no invented road crossing, while a nearby approach still does',()=>{
 const g=base(),r=createRouter(g)(a,b);
 g.roadGeometries=[[[121.5,24.999],[121.5,25.001]]];
 const verify=createLocalRouteVerifier(g);
 assert.equal(verify(r,a,b).error,undefined);
 assert.equal(verify(r,[25,121.499999],b).error,'OFFICIAL_ENTRY_UNVERIFIED');
});
test('a verified shared street remains marked through local verification and fails if its access evidence changes',()=>{
 const g=base();
 g.ways[0]={name:'共道路段',highway:'living_street',source:'osm-shared-street',width:null,slope:null};
 g.edges[0][5]={...proof,sharedRoad:true,sourceTopologyVerified:true,junctionsVerified:true,roadIntersectionsVerified:true,barriersVerified:true};
 g.roadGeometries=[[[a[1],a[0]],[b[1],b[0]]]];
 const candidate=createRouter(g)(a,b),verify=createLocalRouteVerifier(g);
 assert.equal(candidate.error,undefined);
 const result=verify(candidate,a,b);
 assert.equal(result.error,undefined);assert.equal(result.tierSegments[0].sharedRoad,true);
 assert.equal(result.steps[0].sharedRoad,true);assert.equal(result.tierSegments[0].unknownWidth,true);
 const now=Date.parse('2026-11-07T08:00:00Z'),stamp=new Date(now).toISOString();
 const construction={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[{id:'closure',start:'115/11/07',end:'115/11/07',hours:'24小時施工',impact:'blocked',geometries:[{type:'Point',coordinates:[[25,121.5005]]}]}]};
 assert.equal(routeAroundConstruction(result,a,b,{},construction,{router:createRouter(g),verifyLocal:verify},now).error,'CONSTRUCTION_BLOCKED');
 g.ways[0].foot='no';assert.equal(verify(candidate,a,b).error,'UNVERIFIED_NETWORK');
});
test('residential, service and unclassified roads retain shared-road warnings after verification',()=>{
 for(const highway of ['residential','service','unclassified']){
  const g=base();g.ways[0]={name:'道路',highway,source:'osm-shared-street',width:null,slope:null};
  g.edges[0][5]={...proof,sharedRoad:true,sourceTopologyVerified:true,junctionsVerified:true,roadIntersectionsVerified:true,barriersVerified:true};
  const candidate=createRouter(g)(a,b),result=createLocalRouteVerifier(g)(candidate,a,b);
  assert.equal(result.error,undefined,highway);assert.equal(result.tierSegments[0].sharedRoad,true,highway);
  assert.equal(result.tierSegments[0].unknownWidth,true,highway);assert.equal(result.steps[0].sharedRoad,true,highway);
 }
});
test('place planning reports a closure when it is the only way, without returning the diagnostic route',()=>{
 const g=base(),now=Date.parse('2026-11-07T08:00:00Z'),stamp=new Date(now).toISOString();
 const snapshot={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[{id:'closure',start:'115/11/07',end:'115/11/07',hours:'24小時施工',impact:'blocked',geometries:[{type:'Point',coordinates:[[25,121.5005]]}]}]};
 const result=planPlaces({lat:a[0],lon:a[1]},{lat:b[0],lon:b[1]}, {},snapshot,{router:createRouter(g),verifyLocal:createLocalRouteVerifier(g),facilities:[],checker:createConstructionChecker(snapshot,now)});
 assert.equal(result.error,'CONSTRUCTION_BLOCKED');assert.equal(result.coordinates,undefined);
 assert.deepEqual(result.construction.blocked.map(w=>w.id),['closure']);
});
test('place planning prefers a verified alternative to the blocked direct route',()=>{
 const g=base(),c=[25.0003,121.5],d=[25.0003,121.501];
 g.nodes.push([...c,0],[...d,0]);g.edges.push([0,2,33,0,[],proof],[2,3,100,0,[],proof],[3,1,33,0,[],proof]);
 const now=Date.parse('2026-11-07T08:00:00Z'),stamp=new Date(now).toISOString();
 const snapshot={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[{id:'closure',start:'115/11/07',end:'115/11/07',hours:'24小時施工',impact:'blocked',geometries:[{type:'Point',coordinates:[[25,121.5005]]}]}]};
 const result=planPlaces({lat:a[0],lon:a[1]},{lat:b[0],lon:b[1]}, {},snapshot,{router:createRouter(g),verifyLocal:createLocalRouteVerifier(g),facilities:[],checker:createConstructionChecker(snapshot,now)});
 assert.equal(result.error,undefined);assert.ok(result.coordinates.some(p=>p[0]===c[0]));assert.equal(result.construction.blocked.length,0);
});
