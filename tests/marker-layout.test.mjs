import test from "node:test";
import assert from "node:assert/strict";
import { focusOffsetForInset, layoutMapMarkers, markerLabel, metroExitLabelForAccessibility, selectMapMarkers } from "../src/marker-layout.mjs";

test("overview shows station bodies, curated landmarks and history at zoom 13 and 15", () => {
  const station = { id: "station", kind: "20", lat: 25, lon: 121 };
  const landmark = { id: "landmark", kind: "place", landmark: true, lat: 25, lon: 121 };
  const exit = { id: "exit", kind: "metro-elevator", lat: 25, lon: 121 };
  const bus = { id: "bus", kind: "18", lat: 25, lon: 121 };
  const history = { id: "history", lat: 25, lon: 121, name: "曾選的地點" };
  for (const zoom of [13, 15]) {
    assert.deepEqual(selectMapMarkers([station, landmark, exit, bus], [history, station], zoom), [history, station, landmark]);
  }
  assert.deepEqual(selectMapMarkers([station, landmark, exit, bus], [history, station], 17), [history, station, landmark, exit]);
});

test("history can be shown without facility data and invalid coordinates are ignored", () => {
  const history = { name: "曾選的地點", lat: 25, lon: 121 };
  assert.deepEqual(selectMapMarkers([], [history, history, { lat: NaN, lon: 121 }], 13), [history]);
});

test("focused places stay above the bottom drawer", () => {
  assert.equal(focusOffsetForInset(844, 500), 250);
  assert.equal(focusOffsetForInset(844, 0), 0);
  assert.equal(focusOffsetForInset(844, 1000), 362);
});

test("unknown elevator status is never presented as no elevator", () => {
  assert.equal(metroExitLabelForAccessibility({ elevator: true }), "捷運出入口（有電梯）");
  assert.equal(metroExitLabelForAccessibility({ elevator: null }), "捷運出入口");
  assert.equal(metroExitLabelForAccessibility({}), "捷運出入口");
  assert.equal(metroExitLabelForAccessibility({ elevator: false }), "捷運出入口");
});

test("general metro exits appear after zooming in", () => {
  const exit = { id: "general-exit", kind: "metro-exit", lat: 25, lon: 121, stationCode: "R12", elevator: null };
  assert.deepEqual(selectMapMarkers([exit], [], 15), []);
  assert.deepEqual(selectMapMarkers([exit], [], 17), []);
  assert.deepEqual(selectMapMarkers([exit], [], 18), [exit]);
});

test("zoom levels reveal requested categories without treating unknown parking as accessible", () => {
 const make=(id,kind,extra={})=>({id,kind,lat:25,lon:121,...extra});
 const rows=[make('station','20'),make('landmark','place',{landmark:true}),make('lift','metro-elevator'),make('toilet','toilet'),make('exit','metro-exit',{officialAccessible:true}),make('public','public-toilet'),make('parking','16'),make('unknown','15'),make('park','park'),make('health','health'),make('water','water'),make('rest','rest'),make('bus','18'),make('shop','friendly')];
 const ids=z=>selectMapMarkers(rows,[],z).map(p=>p.id);
 assert.deepEqual(ids(15),['station','landmark']);
 assert.deepEqual(ids(16),['station','landmark','lift','toilet','exit']);
 assert.deepEqual(ids(17),['station','landmark','lift','toilet','exit','public','parking','park','health']);
 assert.deepEqual(ids(18),rows.map(p=>p.id));
 assert.ok(selectMapMarkers(rows,[],15,'water').some(p=>p.id==='water'));
});

test("known map duplicates prefer the visible representative and preserve selected history",()=>{
 const a={id:'a',kind:'16',lat:25,lon:121,name:'同地點',mapGroupId:'g',mapGroupRepresentative:false};
 const b={id:'b',kind:'16',lat:25,lon:121,name:'同地點',mapGroupId:'g',mapGroupRepresentative:true};
 assert.deepEqual(selectMapMarkers([a,b],[],17).map(x=>x.id),['b']);
 assert.deepEqual(selectMapMarkers([a],[],17).map(x=>x.id),['a']);
 assert.deepEqual(selectMapMarkers([a,b],[a],17).map(x=>x.id),['a']);
});

test("de-cluttering retains exact colocated venues as separate selectable entries without displacing recent places",()=>{
 const p=(id,x,y,extra={})=>({p:{id,lat:25+y/111195,lon:121+x/100700,kind:'toilet',name:id,...extra},x,y});
 const recent=p('近期選點',5,5),named=p('清楚名稱',12,8),generic=p('飲水處',80,6,{kind:'water'}),other=p('另一店家',200,200,{kind:'friendly'}),same={...other,p:{...other.p,id:'不同店家',name:'不同店家'}};
 const groups=layoutMapMarkers([named,generic,recent,other,same],{size:32,center:{x:0,y:0},recentPlaces:[recent.p]});
 assert.ok(groups.some(g=>g.points[0].p.id==='近期選點'));
 assert.ok(!groups.some(g=>g.points[0].p.id==='清楚名稱'));
 assert.deepEqual(groups.find(g=>g.points[0].p.id==='另一店家').points.map(x=>x.p.id),['另一店家','不同店家']);
 assert.equal(groups.find(g=>g.points[0].p.id==='飲水處').label,null);
});

test("labels preserve explicit context, truncate and do not invent locations",()=>{
 assert.equal(markerLabel({name:'飲水處'}),null);
 assert.equal(markerLabel({name:'飲水處',locationName:'二二八公園'}),'飲水處・二二八公…');
 assert.equal(markerLabel({name:'很長的場館設施名稱測試'}),'很長的場館設施名…');
});

test('a neighbouring icon is removed rather than covering a named marker label',()=>{
 const a={p:{id:'a',kind:'toilet',name:'台北車站',lat:25,lon:121},x:100,y:100};
 const b={p:{id:'b',kind:'health',name:'鄰近醫院',lat:25.0003,lon:121},x:100,y:143};
 const groups=layoutMapMarkers([a,b],{size:32,center:{x:100,y:100}});
 assert.equal(groups.length,1);assert.equal(groups[0].points[0].p.id,'a');assert.equal(groups[0].label,'台北車站');
});
test('a generic icon yields to a readable named place and selected categories survive zoom limits',()=>{
 const generic={p:{id:'drink',kind:'water',name:'飲水處',lat:25,lon:121},x:100,y:100};
 const named={p:{id:'clinic',kind:'health',name:'附近診所',lat:25.0001,lon:121},x:106,y:101};
 const groups=layoutMapMarkers([generic,named],{size:32,center:{x:100,y:100}});
 assert.equal(groups.length,1);assert.equal(groups[0].points[0].p.id,'clinic');assert.equal(groups[0].label,'附近診所');
 assert.equal(selectMapMarkers([generic.p],[],15).length,0);
 assert.equal(selectMapMarkers([generic.p],[],15,'water')[0].id,'drink');
 const filtered=layoutMapMarkers([generic,named],{size:32,center:{x:100,y:100},activeFilter:'water'});
 assert.equal(filtered[0].points[0].p.id,'drink');
});
