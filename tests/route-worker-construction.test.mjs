import test from 'node:test';
import assert from 'node:assert/strict';

test('a blocked via leg returns construction details instead of a diagnostic route',async()=>{
 const points=[[25,121.5],[25,121.501],[25,121.502]];
 const proof={schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
 const area={type:'Polygon',coordinates:[[[121.49,24.99],[121.51,24.99],[121.51,25.01],[121.49,25.01],[121.49,24.99]]]};
 const graph={officialPathEvidence:{schemaVersion:2},officialAreas:[area],officialCrossingAreas:[],roadGeometries:[[[121.51,25],[121.51,25.01]]],nodes:points.map(p=>[...p,0]),ways:[{name:'人行路',highway:'footway',width:2,slope:0}],edges:[[0,1,100,0,[],proof],[1,2,100,0,[],proof]]};
 const oldFetch=globalThis.fetch,oldSelf=globalThis.self,oldPost=globalThis.postMessage;
 const replies=[];
 try{
  globalThis.self={};globalThis.postMessage=message=>replies.push(message);
  globalThis.fetch=async url=>({ok:true,arrayBuffer:async()=>new TextEncoder().encode(JSON.stringify(/facilities|places/.test(String(url))?[]:graph)).buffer});
  await import('../src/route-worker.js');
  await self.onmessage({data:{type:'init',url:'https://example.test/graph.json'}});
  const now=new Date(),stamp=now.toISOString(),local=new Date(now.getTime()+8*3600000);
  const day=`${local.getUTCFullYear()-1911}/${local.getUTCMonth()+1}/${local.getUTCDate()}`;
  const construction={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[{id:'closure',start:day,end:day,hours:'24小時施工',impact:'blocked',geometries:[{type:'Point',coordinates:[[25,121.5015]]}]}]};
  await self.onmessage({data:{type:'route',id:42,start:points[0],via:points[1],end:points[2],options:{},construction}});
  const result=replies.find(m=>m.id===42)?.result;
  assert.equal(result.error,'CONSTRUCTION_BLOCKED');
  assert.equal(result.coordinates,undefined);
 assert.equal(result.routeGap,undefined);
  assert.deepEqual(result.construction.blocked.map(w=>w.id),['closure']);
 }finally{globalThis.fetch=oldFetch;globalThis.self=oldSelf;globalThis.postMessage=oldPost;}
});

test('worker diagnoses only a fully searched NO_ROUTE using the selected endpoint pair',async()=>{
 const n=(x,id)=>[25,121.5+x/100700,0,id],points=[n(0,1),n(100,2),n(120,3),n(220,4)];
 const proof={schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
 const area={type:'Polygon',coordinates:[[[121.49,24.99],[121.51,24.99],[121.51,25.01],[121.49,25.01],[121.49,24.99]]]};
 const graph={officialPathEvidence:{schemaVersion:2},officialAreas:[area],officialCrossingAreas:[],roadGeometries:[[[121.52,25],[121.52,25.01]]],nodes:points,ways:[{name:'人行路',highway:'footway',width:2,slope:0}],edges:[[0,1,100,0,[],proof],[2,3,100,0,[],proof]]};
 const oldFetch=globalThis.fetch,oldSelf=globalThis.self,oldPost=globalThis.postMessage,replies=[];
 try{
  globalThis.self={};globalThis.postMessage=message=>replies.push(message);
  globalThis.fetch=async url=>({ok:true,arrayBuffer:async()=>new TextEncoder().encode(JSON.stringify(/facilities|places/.test(String(url))?[]:graph)).buffer});
  await import('../src/route-worker.js?gap-test');await self.onmessage({data:{type:'init',url:'https://example.test/graph.json'}});
  const stamp=new Date().toISOString(),construction={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]};
  await self.onmessage({data:{type:'plan-places',id:95,startPlace:{lat:points[0][0],lon:points[0][1]},endPlace:{lat:points[3][0],lon:points[3][1]},options:{},construction}});
  const result=replies.find(m=>m.id===95)?.result;assert.equal(result.error,'NO_ROUTE');assert.equal(result.routeGap.status,'candidate');
  assert.deepEqual(result.routeGap.startSide,points[1].slice(0,2));assert.deepEqual(result.routeGap.endSide,points[2].slice(0,2));
  assert.equal(result.failedPair,undefined);assert.equal(result.coordinates,undefined);
 }finally{globalThis.fetch=oldFetch;globalThis.self=oldSelf;globalThis.postMessage=oldPost;}
});

test('construction snapshot expiring during NO_ROUTE diagnosis suppresses gap points',async()=>{
 const n=(x,id)=>[25,121.5+x/100700,0,id],points=[n(0,1),n(100,2),n(120,3),n(220,4)];
 const proof={schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
 const area={type:'Polygon',coordinates:[[[121.49,24.99],[121.51,24.99],[121.51,25.01],[121.49,25.01],[121.49,24.99]]]};
 const graph={officialPathEvidence:{schemaVersion:2},officialAreas:[area],officialCrossingAreas:[],roadGeometries:[[[121.52,25],[121.52,25.01]]],nodes:points,ways:[{highway:'footway',width:2,slope:0}],edges:[[0,1,100,0,[],proof],[2,3,100,0,[],proof]]};
 const oldFetch=globalThis.fetch,oldSelf=globalThis.self,oldPost=globalThis.postMessage,oldNow=Date.now,replies=[];
 try{
  globalThis.self={};globalThis.postMessage=message=>replies.push(message);
  globalThis.fetch=async url=>({ok:true,arrayBuffer:async()=>new TextEncoder().encode(JSON.stringify(/facilities|places/.test(String(url))?[]:graph)).buffer});
  await import('../src/route-worker.js?gap-stale-test');await self.onmessage({data:{type:'init',url:'https://example.test/graph.json'}});
  const base=oldNow(),stamp=new Date(base).toISOString(),construction={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]};
  let calls=0;Date.now=()=>++calls<3?base:base+31*60000;
  await self.onmessage({data:{type:'plan-places',id:96,startPlace:{lat:points[0][0],lon:points[0][1]},endPlace:{lat:points[3][0],lon:points[3][1]},options:{},construction}});
  const result=replies.find(m=>m.id===96)?.result;assert.equal(result.error,'CONSTRUCTION_UNAVAILABLE');assert.equal(result.routeGap,undefined);
 }finally{Date.now=oldNow;globalThis.fetch=oldFetch;globalThis.self=oldSelf;globalThis.postMessage=oldPost;}
});

test('worker loads registered POIs before planning estimated approaches',async()=>{
 const a=[25,121.5],b=[25,121.501],p=[25+30/111195,121.5],poi={id:'poi',kind:'park',name:'公園',lat:p[0],lon:p[1]};
 const proof={schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
 const area={type:'Polygon',coordinates:[[[121.51,25],[121.511,25],[121.511,25.001],[121.51,25.001],[121.51,25]]]};
 const graph={officialPathEvidence:{schemaVersion:2},officialAreas:[area],officialCrossingAreas:[],roadGeometries:[[[121.51,25],[121.51,25.01]]],nodes:[[...a,0],[...b,0]],ways:[{name:'人行路',highway:'footway',width:2,slope:0}],edges:[[0,1,100,0,[],proof]]};
 const oldFetch=globalThis.fetch,oldSelf=globalThis.self,oldPost=globalThis.postMessage,replies=[];
 try{
  globalThis.self={};globalThis.postMessage=message=>replies.push(message);
  globalThis.fetch=async url=>({ok:true,arrayBuffer:async()=>new TextEncoder().encode(JSON.stringify(String(url).includes('facilities')?[]:String(url).includes('places')?[poi]:graph)).buffer});
  await import('../src/route-worker.js?poi-test');await self.onmessage({data:{type:'init',url:'https://example.test/graph.json'}});
  const stamp=new Date().toISOString(),construction={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]};
  await self.onmessage({data:{type:'plan-places',id:44,startPlace:poi,endPlace:{lat:b[0],lon:b[1]},options:{},construction}});
  const result=replies.find(m=>m.id===44)?.result;assert.equal(result.error,undefined);assert.equal(result.approaches[0].estimated,true);
 }finally{globalThis.fetch=oldFetch;globalThis.self=oldSelf;globalThis.postMessage=oldPost;}
});

test('worker offers an unverified nearby point for an upstairs POI',async()=>{
 const a=[25,121.5],b=[25,121.501],p=[25+30/111195,121.5],poi={id:'poi',kind:'place',name:'二樓店',lat:p[0],lon:p[1],level:'1'};
 const proof={schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
 const area={type:'Polygon',coordinates:[[[121.51,25],[121.511,25],[121.511,25.001],[121.51,25.001],[121.51,25]]]};
 const graph={officialPathEvidence:{schemaVersion:2},officialAreas:[area],officialCrossingAreas:[],roadGeometries:[[[121.51,25],[121.51,25.01]]],nodes:[[...a,0,1],[...b,0,2]],ways:[{name:'人行路',highway:'footway',width:2,slope:0}],edges:[[0,1,100,0,[],proof]]};
 const oldFetch=globalThis.fetch,oldSelf=globalThis.self,oldPost=globalThis.postMessage,replies=[];
 try{
  globalThis.self={};globalThis.postMessage=message=>replies.push(message);
  globalThis.fetch=async url=>({ok:true,arrayBuffer:async()=>new TextEncoder().encode(JSON.stringify(String(url).includes('facilities')?[]:String(url).includes('places')?[poi]:graph)).buffer});
  await import('../src/route-worker.js?nearby-test');await self.onmessage({data:{type:'init',url:'https://example.test/graph.json'}});
  const stamp=new Date().toISOString(),construction={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]},endPlace={lat:b[0],lon:b[1]};
  await self.onmessage({data:{type:'plan-places',id:50,startPlace:poi,endPlace,options:{},construction}});
  assert.equal(replies.find(m=>m.id===50)?.result.error,'NO_CONNECTION');
  await self.onmessage({data:{type:'nearby-positions',id:51,startPlace:poi,endPlace,options:{},construction}});
  const result=replies.find(m=>m.id===51)?.result,candidate=result.candidates.find(c=>c.side==='start');
  assert.ok(candidate);assert.deepEqual([candidate.point.lat,candidate.point.lon],a);assert.equal(candidate.routeVerified,false);assert.equal(candidate.routeDistance,null);assert.ok(!('coordinates' in candidate));
 }finally{globalThis.fetch=oldFetch;globalThis.self=oldSelf;globalThis.postMessage=oldPost;}
});

test('worker routes map points on both ends and GPS only as start',async()=>{
 const a=[25,121.5],b=[25,121.501],p=[25+30/111195,121.5];
 const proof={schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
 const area={type:'Polygon',coordinates:[[[121.51,25],[121.511,25],[121.511,25.001],[121.51,25.001],[121.51,25]]]};
 const graph={officialPathEvidence:{schemaVersion:2},officialAreas:[area],officialCrossingAreas:[],roadGeometries:[[[121.51,25],[121.51,25.01]]],nodes:[[...a,0,1],[...b,0,2]],ways:[{name:'人行路',highway:'footway',width:2,slope:0}],edges:[[0,1,100,0,[],proof]]};
 const oldFetch=globalThis.fetch,oldSelf=globalThis.self,oldPost=globalThis.postMessage,replies=[];
 try{
  globalThis.self={};globalThis.postMessage=message=>replies.push(message);
  globalThis.fetch=async url=>({ok:true,arrayBuffer:async()=>new TextEncoder().encode(JSON.stringify(/facilities|places/.test(String(url))?[]:graph)).buffer});
  await import('../src/route-worker.js?user-start-test');await self.onmessage({data:{type:'init',url:'https://example.test/graph.json'}});
  const stamp=new Date().toISOString(),construction={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]},endPlace={lat:b[0],lon:b[1]};
  const starts=[{id:'point-123',originKind:'map',lat:p[0],lon:p[1]},{id:'my-location',originKind:'gps',locationSource:'browser',accuracy:12,needsConfirmation:false,lat:p[0],lon:p[1]}];
  for(const [i,startPlace] of starts.entries()){
   await self.onmessage({data:{type:'plan-places',id:60+i,startPlace,endPlace,options:{},construction}});
   const result=replies.find(m=>m.id===60+i)?.result;assert.equal(result.error,undefined);assert.equal(result.approaches[0].estimated,true);assert.equal(result.approaches[0].entryStatus,'unconfirmed');assert.equal(result.approaches[0].originKind,startPlace.originKind);
   await self.onmessage({data:{type:'plan-places',id:70+i,startPlace:endPlace,endPlace:startPlace,options:{},construction}});
   const reversed=replies.find(m=>m.id===70+i)?.result;
   if(startPlace.originKind==='map'){assert.equal(reversed.error,undefined);assert.equal(reversed.approaches.find(a=>a.side==='end')?.entryStatus,'unconfirmed');}
   else assert.equal(reversed.error,'NO_CONNECTION');
  }
 }finally{globalThis.fetch=oldFetch;globalThis.self=oldSelf;globalThis.postMessage=oldPost;}
});

test('official routes obey the same endpoint restriction and mark a GPS approach as unconfirmed',async()=>{
 const a=[25,121.5],b=[25,121.501],p=[25+3/111195,121.5];
 const proof={schemaVersion:2,coverage:1,maxUncoveredMetres:0,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true};
 const area={type:'Polygon',coordinates:[[[121.49,24.99],[121.51,24.99],[121.51,25.01],[121.49,25.01],[121.49,24.99]]]};
 const graph={officialPathEvidence:{schemaVersion:2},officialAreas:[area],officialCrossingAreas:[],roadGeometries:[[[121.52,25],[121.52,25.01]]],nodes:[[...a,0,1],[...b,0,2]],ways:[{name:'人行路',highway:'footway',width:2,slope:0}],edges:[[0,1,100,0,[],proof]]};
 const closed={id:'closed',kind:'place',lat:p[0],lon:p[1],access:'private'},oldFetch=globalThis.fetch,oldSelf=globalThis.self,oldPost=globalThis.postMessage,replies=[];
 try{
  globalThis.self={};globalThis.postMessage=message=>replies.push(message);
  globalThis.fetch=async url=>({ok:true,arrayBuffer:async()=>new TextEncoder().encode(JSON.stringify(String(url).includes('facilities')?[]:String(url).includes('places')?[closed]:graph)).buffer});
  await import('../src/route-worker.js?official-endpoint-test');await self.onmessage({data:{type:'init',url:'https://example.test/graph.json'}});
  const stamp=new Date().toISOString(),construction={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]},candidate={provider:'taipei-official',coordinates:[a,b],segmentPaths:[[a,b]],crossingSegments:[],distance:100,steps:[]},gps={id:'my-location',originKind:'gps',locationSource:'browser',accuracy:10,needsConfirmation:false,lat:p[0],lon:p[1]};
  await self.onmessage({data:{type:'verify-official',id:80,start:p,end:b,route:candidate,options:{startPlace:gps},construction}});
  assert.equal(replies.find(m=>m.id===80)?.result.error,'OFFICIAL_ENTRY_UNVERIFIED');
  // Reinitialize with no forbidden POI to test a genuine user origin.
  globalThis.fetch=async url=>({ok:true,arrayBuffer:async()=>new TextEncoder().encode(JSON.stringify(/facilities|places/.test(String(url))?[]:graph)).buffer});
  await self.onmessage({data:{type:'init',url:'https://example.test/graph.json'}});
  await self.onmessage({data:{type:'verify-official',id:81,start:p,end:b,route:candidate,options:{startPlace:gps},construction}});
  const result=replies.find(m=>m.id===81)?.result;assert.equal(result.error,undefined);assert.equal(result.approaches[0].estimated,true);assert.equal(result.approaches[0].unconfirmed,true);assert.equal(result.approaches[0].originKind,'gps');
  const officialChoice=result.routeCandidates?.candidates?.find(c=>c.id==='official');assert.ok(officialChoice);assert.equal(officialChoice.metrics.explicitSidewalkMetres,null);assert.equal(officialChoice.metrics.sharedMetres,null);assert.ok(Number.isFinite(officialChoice.score));
  assert.deepEqual(result.approaches[0].coordinates,[p,a]);assert.deepEqual(result.networkCoordinates,[a,b]);assert.equal(result.pedestrianImprovement.status,'unsupported-official-provenance');
  const q=[25+3/111195,121.501],selectedStart={id:'address-start',kind:'place',sourceId:'osm',selectionKind:'user',lat:p[0],lon:p[1]},selectedEnd={id:'address-end',kind:'place',sourceId:'osm',selectionKind:'user',lat:q[0],lon:q[1]};
  await self.onmessage({data:{type:'verify-official',id:83,start:p,end:q,route:candidate,options:{startPlace:selectedStart,endPlace:selectedEnd},construction}});
  const selected=replies.find(m=>m.id===83)?.result;assert.equal(selected.error,undefined);assert.deepEqual(selected.approaches.map(x=>[x.side,x.originKind,x.unconfirmed]),[['start','selected',true],['end','selected',true]]);
  const end=[25+3/111195,121.501],mapEnd={id:'point-123',originKind:'map',lat:end[0],lon:end[1]};
  await self.onmessage({data:{type:'verify-official',id:82,start:p,end,route:candidate,options:{startPlace:gps,endPlace:mapEnd},construction}});
  const both=replies.find(m=>m.id===82)?.result;assert.equal(both.error,undefined);assert.deepEqual(both.networkCoordinates,[a,b]);
  assert.equal(both.approaches.length,2);assert.deepEqual(both.approaches.map(x=>[x.side,x.originKind,x.unconfirmed]),[['start','gps',true],['end','map',true]]);
  assert.deepEqual(both.approaches[1].coordinates,[b,end]);
 }finally{globalThis.fetch=oldFetch;globalThis.self=oldSelf;globalThis.postMessage=oldPost;}
});

test('worker selects the pedestrian detour instead of the shared road centreline',async()=>{
 const n=(x,y)=>[25+y/111195,121.5+x/100700,0,Math.round(x*100+y)+1],nodes=[n(0,0),n(10,0),n(110,0),n(0,15),n(10,15)];
 const proof={schemaVersion:2,coverage:0,maxUncoveredMetres:100,crossingCoverage:0,roadCrossingVerified:true,crossingVerified:true},shared={...proof,sharedRoad:true,sourceTopologyVerified:true,junctionsVerified:true,roadIntersectionsVerified:true,barriersVerified:true};
 const area={type:'Polygon',coordinates:[[[121.51,25],[121.511,25],[121.511,25.001],[121.51,25.001],[121.51,25]]]};
 const graph={officialPathEvidence:{schemaVersion:2},nodeIdentity:'OSM node ID; coincident coordinates do not create connectivity',officialAreas:[area],officialCrossingAreas:[],roadGeometries:[[[121.51,25],[121.51,25.01]]],nodes,ways:[{name:'共行',highway:'residential',source:'osm-shared-street',width:null,slope:null},{name:'步道',highway:'footway',width:1.5,slope:0}],edges:[[0,1,10,0,[],shared],[1,2,100,1,[],proof],[0,3,15,1,[],proof],[3,4,10,1,[],proof],[4,1,15,1,[],proof]]};
 const oldFetch=globalThis.fetch,oldSelf=globalThis.self,oldPost=globalThis.postMessage,replies=[];
 try{
  globalThis.self={};globalThis.postMessage=message=>replies.push(message);
  globalThis.fetch=async url=>({ok:true,arrayBuffer:async()=>new TextEncoder().encode(JSON.stringify(/facilities|places/.test(String(url))?[]:graph)).buffer});
  await import('../src/route-worker.js?pedestrian-improvement-test');await self.onmessage({data:{type:'init',url:'https://example.test/graph.json'}});
  const stamp=new Date().toISOString(),construction={schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works:[]},startPlace={lat:nodes[0][0],lon:nodes[0][1]},endPlace={lat:nodes[2][0],lon:nodes[2][1]};
  await self.onmessage({data:{type:'plan-places',id:90,startPlace,endPlace,options:{},construction}});
  const result=replies.find(m=>m.id===90)?.result;assert.equal(result.error,undefined);
  const choices=result.routeCandidates?.candidates||[],improved=choices.find(c=>c.route.distance===140);
  assert.ok(improved,'the independently verified low-shared route remains selectable');
  assert.equal(improved.metrics.sharedMetres,0);assert.ok(!improved.route.edgeIds.includes(0));
  assert.equal(result.selectedCandidateId,choices[0].id);assert.equal(result.distance,choices[0].route.distance);
 }finally{globalThis.fetch=oldFetch;globalThis.self=oldSelf;globalThis.postMessage=oldPost;}
});
