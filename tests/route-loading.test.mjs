import test from 'node:test';
import assert from 'node:assert/strict';
import {routeLoadingMessage} from '../src/route-loading.mjs';

test('loading text reflects the current route phase',()=>{
 assert.match(routeLoadingMessage({preparing:true}).title,/準備/);
 assert.match(routeLoadingMessage({}).title,/尋找路線/);
 assert.match(routeLoadingMessage({comparing:true}).title,/比較/);
 assert.match(routeLoadingMessage({nearby:true}).title,/連通/);
 assert.match(routeLoadingMessage({preparing:true,comparing:true}).title,/準備/);
});
