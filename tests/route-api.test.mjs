import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { validPoints } from '../api/accessible-route.js';
const points = [{ lat: 25.047, lng: 121.517 }, { lat: 25.048, lng: 121.517 }];
const response = () => ({ headers: {}, setHeader(k,v) { this.headers[k]=v; }, end(v) { this.body=JSON.parse(v); } });
test('route proxy accepts only two finite Taipei points', () => {
  assert.equal(validPoints({ points }), true);
  for (const p of [[], [...points, points[0]], [{lat: NaN, lng:121.5},points[1]], [{lat:0,lng:0},points[1]]])
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
