import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoutePrewarmer} from '../src/route-prewarm.mjs';

test('planning actions share one location-free warmup request and avoid repeated work',async()=>{
 let calls=0,resolve,clock=1000,body;const prewarm=createRoutePrewarmer({now:()=>clock,fetcher:(_url,options)=>{calls++;body=JSON.parse(options.body);return new Promise(r=>{resolve=r})}});
 const a=prewarm(),b=prewarm();await Promise.resolve();assert.equal(calls,1);assert.deepEqual(body,{task:{type:'warmup',id:0}});
 resolve({ok:true,json:async()=>({type:'warmup',id:0,result:{ready:true}})});assert.deepEqual(await Promise.all([a,b]),[true,true]);assert.equal(await prewarm(),true);assert.equal(calls,1);
 clock+=31000;const c=prewarm();await Promise.resolve();assert.equal(calls,2);resolve({ok:true,json:async()=>({type:'warmup',id:0,result:{ready:true}})});assert.equal(await c,true);
});
test('warmup failure is silent and a later planning action can retry',async()=>{
 let calls=0;const prewarm=createRoutePrewarmer({fetcher:async()=>{calls++;if(calls===1)throw Error('offline');return {ok:true,json:async()=>({type:'warmup',id:0,result:{ready:true}})}}});
 assert.equal(await prewarm(),false);assert.equal(await prewarm(),true);assert.equal(calls,2);
});
