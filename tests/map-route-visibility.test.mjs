import test from 'node:test';
import assert from 'node:assert/strict';
import {mapRouteVisibility} from '../src/map-route-visibility.mjs';

test('new planning and automatic comparison hide old routes and their partial geometry',()=>{
 const route={id:'old'},partialRoute={id:'partial'};
 for(const state of [{routing:true},{automaticComparisonLoading:true}]){
  const result=mapRouteVisibility({tab:'plan',route,partialRoute,...state});
  assert.equal(result.route,null);assert.equal(result.partialRoute,null);assert.equal(result.pending,true);
 }
});
test('completed route and explicit detour searches retain the selected route',()=>{
 const route={id:'verified'},partialRoute={id:'partial'};
 assert.equal(mapRouteVisibility({tab:'plan',route,partialRoute}).route,route);
 assert.equal(mapRouteVisibility({tab:'plan',route,partialRoute,simpleNoRoute:true}).partialRoute,null);
 assert.equal(mapRouteVisibility({tab:null,route,partialRoute}).route,null);
});
