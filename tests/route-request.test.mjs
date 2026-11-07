import test from 'node:test';
import assert from 'node:assert/strict';
import { requestOfficialRoute } from '../src/official-router.mjs';
const a = [25.047,121.517], b = [25.052,121.521];
test('outside-range and malformed points are identified before any network transmission', async t => {
  const network = t.mock.method(globalThis, 'fetch', () => { throw Error('must not send'); });
  assert.equal((await requestOfficialRoute([22.63,120.30],b)).error,'OFFICIAL_OUTSIDE_COVERAGE');
  assert.equal((await requestOfficialRoute([NaN,121.517],b)).error,'OFFICIAL_INVALID_POINTS');
  assert.equal(network.mock.callCount(),0);
});
test('missing API, HTML fallback, timeout and invalid coordinates do not all become connection failures', async t => {
  const cases = [
    [404,'',{},'OFFICIAL_NOT_CONFIGURED'],
    [405,'',{},'OFFICIAL_NOT_CONFIGURED'],
    [200,'<!doctype html>',{'content-type':'text/html'},'OFFICIAL_NOT_CONFIGURED'],
    [504,'',{},'OFFICIAL_TIMEOUT'],
    [422,JSON.stringify({error:'OUTSIDE_COVERAGE'}),{'content-type':'application/json'},'OFFICIAL_OUTSIDE_COVERAGE'],
    [400,JSON.stringify({error:'INVALID_POINTS'}),{'content-type':'application/json'},'OFFICIAL_INVALID_POINTS'],
    [502,JSON.stringify({error:'UPSTREAM_INVALID'}),{'content-type':'application/json'},'OFFICIAL_INVALID'],
    [502,JSON.stringify({error:'UPSTREAM_UNAVAILABLE'}),{'content-type':'application/json'},'OFFICIAL_UNAVAILABLE'],
    [200,'{broken',{'content-type':'application/json'},'OFFICIAL_INVALID'],
  ];
  for (const [status,body,headers,error] of cases) {
    const stub=t.mock.method(globalThis,'fetch',async()=>new Response(body,{status,headers}));
    assert.equal((await requestOfficialRoute(a,b)).error,error);
    stub.mock.restore();
  }
});
test('browser cancellation timeout differs from a network failure', async t => {
  for (const [name,expected] of [['AbortError','OFFICIAL_TIMEOUT'],['TimeoutError','OFFICIAL_TIMEOUT'],['TypeError','OFFICIAL_NETWORK']]) {
    const stub=t.mock.method(globalThis,'fetch',async()=>{const e=new Error('request failed');e.name=name;throw e;});
    assert.equal((await requestOfficialRoute(a,b)).error,expected);
    stub.mock.restore();
  }
});
