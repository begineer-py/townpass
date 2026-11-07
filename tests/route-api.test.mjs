import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { validPoints } from '../api/accessible-route.js';
const points = [{ lat: 25.047, lng: 121.517 }, { lat: 25.048, lng: 121.517 }];
const response = () => ({ headers: {}, setHeader(k,v) { this.headers[k]=v; }, end(v) { this.body=JSON.parse(v); } });
test('route proxy accepts two endpoints and at most one via point', () => {
  assert.equal(validPoints({ points }), true);
  assert.equal(validPoints({ points: [...points, points[0]] }), true);
  for (const p of [[], [...points, ...points], [{lat: NaN, lng:121.5},points[1]], [{lat:0,lng:0},points[1]]])
    assert.equal(validPoints({ points: p }), false);
});
test('route proxy rejects methods and invalid input without contacting upstream', async () => {
  for (const [req, status] of [[{method:'GET'},405],[{method:'POST',body:{points:[]}},400]]) {
    const res=response(); await handler(req,res); assert.equal(res.statusCode,status);
  }
});
test('route proxy forwards only coordinates and removes internal metadata', async t => {
  t.mock.method(globalThis,'fetch',async (url, opts) => {
    assert.match(url,/^https:\/\/tppano.gov.taipei\//);
    assert.deepEqual(JSON.parse(opts.body), {points});
    return {ok:true,json:async()=>({success:true,metadata:{crs:'EPSG:3826',data_source:'private-path'},segments:[],all_segments:[]})};
  });
  const res=response();
  await handler({method:'POST',body:{points: points.map(p=>({...p,identity:'not-forwarded'})),url:'https://other.example'}},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.metadata.data_source,undefined);
  assert.equal(res.headers['Cache-Control'],'no-store');
});
test('out-of-range origin is a coverage response, not a failed upstream request', async t => {
  const stub=t.mock.method(globalThis,'fetch',()=>{throw Error('must not query');});
  const res=response();
  await handler({method:'POST',body:{points:[{lat:22.63,lng:120.30},points[1]]}},res);
  assert.equal(res.statusCode,422);
  assert.equal(res.body.error,'OUTSIDE_COVERAGE');
  assert.equal(stub.mock.callCount(),0);
});
test('upstream timeout and invalid JSON remain distinct from invalid user input', async t => {
  for (const [fetcher,status,code] of [
    [async()=>{const e=new Error();e.name='TimeoutError';throw e;},504,'UPSTREAM_TIMEOUT'],
    [async()=>({ok:true,json:async()=>{throw new SyntaxError();}}),502,'UPSTREAM_INVALID'],
  ]) {
    const stub=t.mock.method(globalThis,'fetch',fetcher),res=response();
    await handler({method:'POST',body:{points}},res);
    assert.equal(res.statusCode,status);
    assert.equal(res.body.error,code);
    stub.mock.restore();
  }
});
