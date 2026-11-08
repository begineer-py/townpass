import test from 'node:test';
import assert from 'node:assert/strict';
import {autoMetroEntrance} from '../src/auto-metro-entrance.mjs';
const exits=[{kind:'metro-elevator',station:'台北車',name:'台北車站出口電梯',lat:25.05,lon:121.52}];
test('the hint is shown for metro station centres but not explicitly chosen exits',()=>{
 assert.equal(autoMetroEntrance({kind:'20',name:'臺北車站(R10)'},exits),true);
 assert.equal(autoMetroEntrance({kind:'station',name:'臺北車站',lat:25.05,lon:121.52},exits),true);
 assert.equal(autoMetroEntrance({kind:'station',name:'1號出入口'},exits),false);
 assert.equal(autoMetroEntrance({kind:'metro-elevator',name:'台北車站出口電梯'},exits),false);
 assert.equal(autoMetroEntrance({kind:'station',name:'汐止'},exits),false);
});

test('a distant railway station with the same name is not mistaken for a metro station',()=>{
 assert.equal(autoMetroEntrance({kind:'station',name:'臺北車站',lat:25.1,lon:121.52},exits),false);
});
test('a known nearby metro station is recognized even if entrance data is missing',()=>{
 const station={kind:'station',name:'臺北車站',lat:25.05,lon:121.52};
 assert.equal(autoMetroEntrance(station,[{kind:'20',name:'台北車站(R10)',lat:25.05,lon:121.52}]),true);
});
