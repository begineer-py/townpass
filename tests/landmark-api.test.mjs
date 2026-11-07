import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/landmark-search.js';

const response = () => ({ headers:{}, setHeader(k,v) { this.headers[k]=v; }, end(v) { this.body=JSON.parse(v); } });
test('landmark lookup forwards only the fixed query and validates the returned coordinates', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    assert.equal(url.origin, 'https://tppano.gov.taipei');
    assert.equal(url.searchParams.get('SERVICE'), 'SEARCHLANDMARK');
    assert.equal(url.searchParams.get('KEYWORD'), '兒童新樂園');
    assert.equal(url.searchParams.get('SRS_T'), 'WGS84');
    assert.equal(url.searchParams.has('identity'), false);
    return {ok:true,json:async()=>[
      {markName:'兒童新樂園',x:121.51498,y:25.09624},
      {markName:'invalid',x:null,y:25}, {markName:'outside',x:10,y:10},
    ]};
  });
  const res=response();
  await handler({method:'GET',url:'/?q=兒童新樂園&identity=secret'},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.length,1);
  assert.equal(res.body[0].name,'兒童新樂園');
  assert.equal(res.body[0].kind,'place');
  assert.equal(res.headers['Cache-Control'],'no-store');
});
test('landmark lookup rejects short queries and non-GET methods without a request', async t => {
  const stub=t.mock.method(globalThis,'fetch',()=>{throw Error('unexpected request');});
  for (const [req,status] of [[{method:'GET',url:'/?q=x'},400],[{method:'POST',url:'/?q=芝山'},405]]) {
    const res=response(); await handler(req,res); assert.equal(res.statusCode,status);
  }
  assert.equal(stub.mock.callCount(),0);
});
