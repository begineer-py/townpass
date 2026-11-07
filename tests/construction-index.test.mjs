import test from 'node:test';
import assert from 'node:assert/strict';
import {createConstructionChecker} from '../src/construction.mjs';

const now=Date.parse('2026-11-07T08:00:00Z'),stamp=new Date(now).toISOString();
const at=(x,y)=>[25+y/111195,121.5+x/100700];
const work=(id,geometry,impact='blocked')=>({id,address:id,start:'115/11/07',end:'115/11/07',hours:'24小時施工',impact,geometries:[geometry]});
const snap=works=>({schemaVersion:1,fetchedAt:stamp,sourceUpdatedAt:stamp,works});
const ids=works=>works.map(w=>w.id).sort();

test('index agrees with separate exhaustive work checks and allowed agrees with inspect',()=>{
 const works=[];
 for(let x=0;x<12;x++)for(let y=0;y<12;y++){
  const id=`${x}-${y}`,cx=x*95,cy=y*97;
  const geom=(x+y)%3===0?{type:'Point',coordinates:[at(cx,cy)]}:(x+y)%3===1?{type:'LineString',coordinates:[at(cx-20,cy),at(cx+20,cy)]}:{type:'Polygon',coordinates:[at(cx-10,cy-10),at(cx+10,cy-10),at(cx+10,cy+10),at(cx-10,cy+10),at(cx-10,cy-10)]};
  works.push(work(id,geom,(x*y)%7===0?'clear':'blocked'));
 }
 const all=createConstructionChecker(snap(works),now);
 const single=works.map(w=>createConstructionChecker(snap([w]),now));
 for(let i=0;i<50;i++){
  const line=[at((i*103)%1100,(i*211)%1100),at((i*173+800)%1100,(i*59+500)%1100)];
  const result=all.inspect(line),separate=single.map(c=>c.inspect(line));
  assert.deepEqual(ids(result.nearby),ids(separate.flatMap(r=>r.nearby)));
  assert.deepEqual(ids(result.blocked),ids(separate.flatMap(r=>r.blocked)));
  assert.equal(all.allowed(line),result.blocked.length===0);
 }
});

test('long lines, oversized polygons, touching boundaries and 10m vicinity stay detectable',()=>{
 const polygon={type:'Polygon',coordinates:[[24.91,121.41],[24.91,121.79],[25.29,121.79],[25.29,121.41],[24.91,121.41]]};
 const large=createConstructionChecker(snap([work('area',polygon)]),now);
 assert.equal(large.allowed([[25,121.5]]),false);
 assert.equal(large.inspect([[25,121.5]]).blocked[0].id,'area');
 const line=[at(-9900,-9000),at(9900,9000)],point=at(0,0),cross=createConstructionChecker(snap([work('point',{type:'Point',coordinates:[point]})]),now);
 assert.equal(cross.allowed(line),false);assert.equal(cross.inspect(line).blocked[0].id,'point');
 const near=createConstructionChecker(snap([work('point',{type:'Point',coordinates:[at(0,0)]})]),now);
 assert.equal(near.allowed([at(0,9.99)]),false);assert.equal(near.allowed([at(0,10.01)]),true);
 assert.equal(near.inspect([at(0,69.99)]).nearby.length,1);assert.equal(near.inspect([at(0,70.01)]).nearby.length,0);
 const bounds=createConstructionChecker(snap([work('bounds',{type:'Polygon',coordinates:[at(0,0),at(10,0),at(10,10),at(0,10),at(0,0)]})]),now);
 assert.equal(bounds.allowed([at(0,5)]),false);assert.equal(bounds.allowed([at(5,5)]),false);
});
