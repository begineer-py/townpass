import test from 'node:test';
import assert from 'node:assert/strict';
import {previewSwipeDirection} from '../src/preview-swipe.mjs';
test('horizontal swipes choose the next or previous route without treating vertical scroll as a swipe',()=>{
 assert.equal(previewSwipeDirection({x:100,y:10},{x:40,y:15}),1);
 assert.equal(previewSwipeDirection({x:20,y:10},{x:80,y:15}),-1);
 assert.equal(previewSwipeDirection({x:100,y:10},{x:75,y:12}),0);
 assert.equal(previewSwipeDirection({x:100,y:10},{x:40,y:100}),0);
 assert.equal(previewSwipeDirection(null,{x:1,y:2}),0);
});
