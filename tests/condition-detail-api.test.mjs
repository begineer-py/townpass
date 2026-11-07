import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/official-condition-detail.js';
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},end(text){this.body=JSON.parse(text);}};}
test('accepts only fixed official categories and numeric ids',async()=>{
 const r=response();await handler({method:'GET',url:'/?type=other&id=1'},r);assert.equal(r.statusCode,400);
 const s=response();await handler({method:'GET',url:'/?type=missing_noCurbSlope&id=abc'},s);assert.equal(s.statusCode,400);
});
test('returns only validated cause and activity from the official record',async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=async(url,options)=>{assert.match(url,/^https:\/\/tppano\.gov\.taipei\//);assert.deepEqual(JSON.parse(options.body),{tableName:'missing_noCurbSlope',qgs_fid:'16528'});return {ok:true,json:async()=>({code:'101',data:{tableName:{enName:'missing_noCurbSlope'},data:{qgs_fid:'16528',missing_cause:'燈桿',areaType:'中',private:'not returned'}}})};};
  const r=response();await handler({method:'GET',url:'/?type=missing_noCurbSlope&id=16528'},r);assert.equal(r.statusCode,200);assert.deepEqual(r.body,{id:'16528',type:'missing_noCurbSlope',cause:'燈桿',activity:'中'});
 }finally{globalThis.fetch=original;}
});
