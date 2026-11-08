import test from 'node:test';
import assert from 'node:assert/strict';
import {createVoiceRecognition} from '../src/voice-recognition.mjs';
function setup(){
 const sessions=[],states=[],results=[],timers=new Map();let id=0;
 class Recognition{constructor(){sessions.push(this);}start(){this.onstart?.();}stop(){this.stopped=true;}abort(){this.aborted=true;}}
 const engine=createVoiceRecognition({Recognition,onState:s=>states.push(s),onResult:s=>results.push(s),setTimer:fn=>{timers.set(++id,fn);return id;},clearTimer:id=>timers.delete(id)});
 return {engine,sessions,states,results,timers};
}
test('starts only on request and sends all final recognized text to search',()=>{
 const s=setup();assert.equal(s.sessions.length,0);s.engine.start();const r=s.sessions[0];assert.equal(r.lang,'zh-TW');assert.equal(s.states.at(-1).status,'listening');
 r.onresult({resultIndex:0,results:[Object.assign([{transcript:'台北'}],{isFinal:true}),Object.assign([{transcript:'車站。'}],{isFinal:true})]});assert.deepEqual(s.results,['台北車站']);assert.equal(s.states.at(-1).status,'idle');assert.equal(r.aborted,true);assert.equal(s.timers.size,0);
});
test('speech ending stops capture and a final result closes the session without waiting for end',()=>{
 const s=setup();s.engine.start();const r=s.sessions[0];r.onspeechend();assert.equal(r.stopped,true);assert.equal(s.states.at(-1).status,'processing');
 r.onresult({resultIndex:0,results:[Object.assign([{transcript:'大安公園'}],{isFinal:true})]});assert.deepEqual(s.results,['大安公園']);assert.equal(s.states.at(-1).status,'idle');assert.equal(r.aborted,true);assert.equal(r.onspeechend,null);
 s.engine.start();assert.equal(s.sessions.length,2);
});
test('speech ending without a result shows a retry message',()=>{
 const s=setup();s.engine.start();const r=s.sessions[0];r.onspeechend();r.onend();assert.match(s.states.at(-1).message,/沒有聽到/);
});
test('an already stopped browser can still return its final recognition result',()=>{
 const s=setup();s.engine.start();const r=s.sessions[0];r.stop=()=>{throw Error('already stopping');};r.onspeechend();assert.equal(s.states.at(-1).status,'processing');
 r.onresult({resultIndex:0,results:[Object.assign([{transcript:'芝山站'}],{isFinal:true})]});assert.deepEqual(s.results,['芝山站']);assert.equal(s.states.at(-1).status,'idle');
});
test('permission errors, missing browser support and constructor failures stay visible and can retry',()=>{
 const s=setup();s.engine.start();s.sessions[0].onerror({error:'not-allowed'});assert.match(s.states.at(-1).message,/權限/);s.engine.start();assert.equal(s.sessions.length,2);
 const states=[],x=createVoiceRecognition({onState:v=>states.push(v)});x.start();assert.match(states.at(-1).message,/不支援/);
 const y=createVoiceRecognition({Recognition:class{constructor(){throw Error('fail');}},onState:v=>states.push(v)});y.start();assert.match(states.at(-1).message,/無法啟動/);
});
test('timeout, stop and disposal do not accept late events',()=>{
 const s=setup();s.engine.start();let r=s.sessions[0],late=r.onresult;[...s.timers.values()][0]();assert.equal(r.aborted,true);assert.match(s.states.at(-1).message,/逾時/);late({results:[[{transcript:'錯誤'}]],resultIndex:0});assert.deepEqual(s.results,[]);
 s.engine.start();r=s.sessions[1];s.engine.start();assert.equal(r.stopped,true);r.onend();assert.match(s.states.at(-1).message,/已停止/);
 s.engine.start();r=s.sessions[2];late=r.onresult;s.engine.dispose();late({results:[[{transcript:'錯誤'}]],resultIndex:0});assert.deepEqual(s.results,[]);assert.equal(s.timers.size,0);
});
