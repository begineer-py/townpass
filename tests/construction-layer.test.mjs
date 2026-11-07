import test from 'node:test';
import assert from 'node:assert/strict';
import {selectVisibleConstruction,constructionLabel,createConstructionRedrawGate} from '../src/construction-layer.mjs';
const now=Date.parse('2026-11-07T22:51:00Z'),stamp=new Date(now).toISOString();
const snapshot=works=>({schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works});
const make=(id,impact,geometries,patch={})=>({id,address:'公開地址',impact,start:'115/11/08',end:'115/11/08',hours:'24小時施工',geometries,...patch});
const bounds=[25,121.5,25.01,121.51],point=(lat,lon)=>({type:'Point',coordinates:[[lat,lon]]});
test('viewport lists active reported works including non-blocking projects',()=>{
 const input=snapshot([make('a','blocked',[point(25.005,121.505)]),make('b','clear',[point(25.006,121.506)]),make('c','unknown',[point(25.007,121.507)]),make('old','blocked',[point(25.005,121.505)],{start:'115/11/06',end:'115/11/07'}),make('out','blocked',[point(25.1,121.6)])]);
 const result=selectVisibleConstruction(input,bounds,now);assert.equal(result.status,'ready');assert.deepEqual(result.items.map(x=>x.work.id),['a','c','b']);assert.equal(result.total,3);assert.equal(result.truncated,false);
 assert.match(constructionLabel(result.items[0].work,result.items[0].anchorGeometry),/可能影響通行.*位置/);assert.match(constructionLabel(result.items[2].work,result.items[2].anchorGeometry),/未通報阻斷/);
});
test('freshness and invalid bounds never produce visible work',()=>{
 const s=snapshot([make('a','blocked',[point(25.005,121.505)])]);assert.equal(selectVisibleConstruction(s,bounds,now+31*60*1000).status,'stale');assert.equal(selectVisibleConstruction(s,[0,1,NaN,2],now).status,'invalid');
});
test('deduplicates project marker while preserving visible line and polygon geometries',()=>{
 const line={type:'LineString',coordinates:[[25.005,121.49],[25.005,121.52]]};
 const polygon={type:'Polygon',coordinates:[[25.004,121.504],[25.004,121.506],[25.006,121.506],[25.006,121.504],[25.004,121.504]]};
 const r=selectVisibleConstruction(snapshot([make('x','blocked',[line,polygon])]),bounds,now);assert.equal(r.items.length,1);assert.equal(r.items[0].geometries.length,2);
 assert.ok(r.items[0].point[0]>=bounds[0]&&r.items[0].point[0]<=bounds[2]&&r.items[0].point[1]>=bounds[1]&&r.items[0].point[1]<=bounds[3]);
 assert.match(constructionLabel(r.items[0].work,polygon),/通報範圍/);
});
test('intersecting bounding boxes without actual line intersection do not invent an on-screen marker',()=>{
 const line={type:'LineString',coordinates:[[24.999,121.5095],[25.0004,121.512]]};
 const r=selectVisibleConstruction(snapshot([make('x','blocked',[line])]),bounds,now);assert.equal(r.items.length,0);
});
test('budget is explicit and retains nearest geometry plus highest-impact projects',()=>{
 const works=[make('a','clear',[point(25.005,121.505)]),make('b','blocked',[point(25.009,121.509)]),make('c','unknown',[point(25.006,121.506)])];
 const r=selectVisibleConstruction(snapshot(works),bounds,now,2,1);assert.equal(r.total,3);assert.equal(r.items.length,1);assert.equal(r.items[0].work.id,'b');assert.equal(r.truncated,true);
});
test('a project polygon covering the viewport still provides an in-area marker',()=>{
 const polygon={type:'Polygon',coordinates:[[24.99,121.49],[24.99,121.52],[25.02,121.52],[25.02,121.49],[24.99,121.49]]};
 const r=selectVisibleConstruction(snapshot([make('a','blocked',[polygon])]),bounds,now);assert.equal(r.items.length,1);assert.ok(Math.abs(r.items[0].point[0]-25.005)<1e-9);assert.ok(Math.abs(r.items[0].point[1]-121.505)<1e-9);
});

test('visible route-relevant work is prioritised without expanding view or limits',()=>{
 const works=[make('other','blocked',[point(25.005,121.505)]),make('route','clear',[point(25.009,121.509)]),make('outside','blocked',[point(25.1,121.6)])];
 const r=selectVisibleConstruction(snapshot(works),bounds,now,1,3,['route','outside']);assert.equal(r.total,2);assert.equal(r.items.length,1);assert.equal(r.items[0].work.id,'route');assert.equal(r.truncated,true);
});

test('repeated project geometries are one marker while retaining all source IDs for priority',()=>{
 const g=point(25.005,121.505),duplicate=[make('project-1','clear',[g]),make('project-2','clear',[g])];
 const other=make('other-1','blocked',[point(25.006,121.506)]),r=selectVisibleConstruction(snapshot([...duplicate,other]),bounds,now,1,10,['project-2']);
 assert.equal(r.total,2);assert.equal(r.items.length,1);assert.equal(r.items[0].count,2);assert.equal(r.items[0].geometries.length,1);assert.deepEqual(r.items[0].ids,['project-1','project-2']);assert.equal(r.truncated,true);
});

test('construction popup auto-pan defers redraw until that popup closes',()=>{
 let id=0,redraws=0;const timers=new Map(),setTimer=fn=>{const key=++id;timers.set(key,fn);return key;},clearTimer=key=>timers.delete(key),flush=()=>{for(const [key,fn] of [...timers]){timers.delete(key);fn();}};
 const gate=createConstructionRedrawGate({redraw:()=>redraws++,setTimer,clearTimer}),popup={};
 gate.open(popup);gate.move();gate.move();flush();assert.equal(redraws,0);
 gate.close({});assert.equal(redraws,0);gate.close(popup);assert.equal(redraws,1);flush();assert.equal(redraws,1);gate.dispose();
});
test('expiry redraws immediately despite an open popup and cleanup cancels timers',()=>{
 let id=0,redraws=0;const timers=new Map(),setTimer=fn=>{const key=++id;timers.set(key,fn);return key;},clearTimer=key=>timers.delete(key);
 const gate=createConstructionRedrawGate({redraw:()=>redraws++,setTimer,clearTimer}),popup={};
 gate.open(popup);gate.move();gate.expire();assert.equal(redraws,1);gate.close(popup);assert.equal(redraws,1);
 gate.move();assert.equal(timers.size,1);gate.dispose();assert.equal(timers.size,0);gate.move();assert.equal(redraws,1);
});
test('an already scheduled viewport update survives popup opening',()=>{
 let id=0,redraws=0;const timers=new Map(),setTimer=fn=>{const key=++id;timers.set(key,fn);return key;},clearTimer=key=>timers.delete(key);
 const gate=createConstructionRedrawGate({redraw:()=>redraws++,setTimer,clearTimer}),popup={};gate.move();assert.equal(timers.size,1);gate.open(popup);assert.equal(timers.size,0);gate.close(popup);assert.equal(redraws,1);gate.dispose();
});
