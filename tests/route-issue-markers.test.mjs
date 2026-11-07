import test from 'node:test';
import assert from 'node:assert/strict';
import {routeIssueMarkers} from '../src/route-issue-markers.mjs';
import {ROUTING_POLICY} from '../src/routing.mjs';
const a=[25,121.5],b=[25,121.5003],c=[25,121.5006];
const route=(points,extra={})=>({policyVersion:ROUTING_POLICY,geometryVerification:'pedestrian-network-v1',coordinates:[a,b,c],officialConditions:{status:'available',points},...extra});
const record=(id,lat,lon,type='missing_noCurbSlope')=>({id,lat,lon,type,activity:'活動區域分類-高'});
test('reports real nearby source records, aggregates exact positions and keeps the caveat',()=>{
 const p=record('a',25.00001,121.50015),q=record('b',p.lat,p.lon,'missing_crosswalkNoRamp');
 const {markers,highlights}=routeIssueMarkers(route([p,q,p,record('far',25.001,121.50015)]));
 assert.equal(markers.length,1);assert.equal(markers[0].records.length,2);assert.match(markers[0].title,/2 筆/);assert.match(markers[0].detail,/淨寬不足.*行穿線未設路緣斜坡/);assert.match(markers[0].detail,/實際關係未確認/);assert.ok(highlights.length>0);
 assert.ok(highlights.flatMap(h=>h.coordinates).every(p=>p[0]===25&&p[1]>=a[1]&&p[1]<=c[1]));
});
test('keeps mapped observations on the other side as nearby rather than confirmed blockers',()=>{
 const point=record('a',25+9/111195,121.50015);const {markers,highlights}=routeIssueMarkers(route([point]));
 assert.equal(markers.length,1);assert.match(markers[0].detail,/距路線約 9 公尺/);assert.match(highlights[0].label,/附近.*實際關係未確認/);
});
test('does not mark invalid data, unavailable observations or an unverified candidate',()=>{
 const p=record('a',25,121.50015);assert.deepEqual(routeIssueMarkers(route([p],{geometryVerification:null})),{markers:[],highlights:[]});
 assert.deepEqual(routeIssueMarkers(route([p],{officialConditions:{status:'unavailable',points:[p]}})),{markers:[],highlights:[]});
 assert.deepEqual(routeIssueMarkers(route([{...p,lat:NaN},{...p,type:'other'}])),{markers:[],highlights:[]});
});
test('screened official source route is supported and source text cannot inject labels',()=>{
 const p={...record('<img onerror=x>',25,121.50015),activity:'<script>x</script>',label:'<img onerror=x>'};
 const r=route([p],{geometryVerification:null,kind:'official-passageway',verification:'official-source-screened-v1',navigationAllowed:true});
 const {markers}=routeIssueMarkers(r);assert.equal(markers.length,1);assert.doesNotMatch(markers[0].title+markers[0].detail,/<|>/);assert.match(markers[0].detail,/未提供/);
 assert.equal(routeIssueMarkers({...r,navigationAllowed:false}).markers.length,0);
});
