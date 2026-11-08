import test from 'node:test';
import assert from 'node:assert/strict';
import {createMapRedrawScheduler} from '../src/map-redraw-scheduler.mjs';

test('coalesces movement, rotation and data changes into one redraw',()=>{
 let calls=0,next=0;const tasks=new Map();
 const scheduler=createMapRedrawScheduler(()=>calls++,{setTimer:fn=>{const id=++next;tasks.set(id,fn);return id},clearTimer:id=>tasks.delete(id)});
 for(let i=0;i<100;i++)scheduler.schedule();assert.equal(tasks.size,1);[...tasks.values()][0]();assert.equal(calls,1);scheduler.dispose();
});
test('unmount cancels pending redraw and prevents new work',()=>{
 let calls=0,fn;const scheduler=createMapRedrawScheduler(()=>calls++,{setTimer:callback=>{fn=callback;return 1},clearTimer:()=>{}});
 scheduler.schedule();scheduler.dispose();fn();scheduler.schedule();assert.equal(calls,0);
});
