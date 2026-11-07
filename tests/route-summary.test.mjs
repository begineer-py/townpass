import test from 'node:test';
import assert from 'node:assert/strict';
import {describeRouteChoices,routeSummaryMetrics} from '../src/route-summary.mjs';
const candidate=(distance,sidewalk,shared,unknown,records=[])=>({route:{distanceMetres:distance,officialConditions:records===null?{status:'unavailable'}:{status:'available',points:records}},coverage:{generalSidewalkMetres:sidewalk,sharedMetres:shared,unknownMetres:unknown,estimatedApproachMetres:0}});
test('compares real sidewalk share and distance, including the longer route tradeoff',()=>{
 const items=[{source:'reference',candidate:candidate(2800,2390,0,2800)},{source:'reference',candidate:candidate(2500,1160,500,2500)}];
 const [a,b]=describeRouteChoices(items);
 assert.match(a.strength,/人行道較多/);assert.match(a.concern,/比最短多走約 300 公尺/);
 assert.match(b.strength,/路程較短/);assert.match(b.concern,/人車共行約 500 公尺/);assert.equal(a.hasUnknown,true);
});
test('unknown conditions never become an invented safe or easy route',()=>{
 const [summary]=describeRouteChoices([{source:'reference',candidate:candidate(100,null,null,null,null)}]);
 assert.match(summary.strength,/資料不足/);assert.match(summary.concern,/資料不足/);
 assert.doesNotMatch(JSON.stringify(summary),/安全|好走|無障礙/);
});
test('nearby records are described as nearby, not as a confirmed obstruction',()=>{
 const item={source:'reference',candidate:candidate(100,80,0,50,[{distanceMetres:9}])};
 const [summary]=describeRouteChoices([item]);assert.match(summary.concern,/附近有 1 筆通行問題紀錄/);assert.match(summary.concern,/資料不足/);
});
test('mixed source metrics use the same categories and do not compare unknown values',()=>{
 const local={route:{officialConditions:{status:'available',points:[]}},metrics:{distanceMetres:100,explicitSidewalkMetres:40,sharedMetres:20,unknownMetres:0,estimatedMetres:0}};
 const ref=candidate(110,null,0,0,[]),m=routeSummaryMetrics(local,'local');assert.equal(m.sidewalk,40);assert.equal(m.records,0);
 const summaries=describeRouteChoices([{source:'local',candidate:local},{source:'reference',candidate:ref}]);
 assert.doesNotMatch(summaries[0].strength,/人行道較多/);assert.doesNotMatch(summaries[1].strength,/人行道較多/);
});

test('other pedestrian distance is included in the sidewalk summary',()=>{
 const local={route:{officialConditions:{status:'available',points:[]}},metrics:{distanceMetres:100,explicitSidewalkMetres:40,otherPedestrianMetres:35,sharedMetres:15,unknownMetres:35,estimatedMetres:0}};
 assert.equal(routeSummaryMetrics(local).sidewalk,75);
 const [summary]=describeRouteChoices([{source:'local',candidate:local}]);
 assert.match(summary.strength,/人行道約 75 公尺/);assert.match(summary.concern,/人車共行/);
});

test('approximate crossings remain visible even when the route has other concerns',()=>{
 const c=candidate(100,60,30,100,[{distanceMetres:1}]);c.route.segments=[{approximateCrossing:true}];
 const [summary]=describeRouteChoices([{source:'reference',candidate:c}]);assert.match(summary.concern,/過街邊界未確認/);
});
