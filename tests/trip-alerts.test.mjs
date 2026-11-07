import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectSavedTrips, alertFingerprint, notifyTownPass } from '../src/trip-alerts.mjs';

const now = Date.parse('2026-11-07T04:00:00Z');
const work = { id: 'closure', address: '測試路', start: '115/11/07', end: '115/11/07', hours: '24小時施工', impact: 'blocked', geometries: [{ type: 'Point', coordinates: [[25, 121.501]] }] };
const snapshot = { schemaVersion: 1, fetchedAt: new Date(now).toISOString(), sourceUpdatedAt: new Date(now).toISOString(), works: [work] };

test('only saved routes intersecting an active work zone produce an alert', () => {
  const trips = [
    { id: 'hit', route: { coordinates: [[25, 121.5], [25, 121.502]] } },
    { id: 'clear', route: { coordinates: [[25.01, 121.5], [25.01, 121.502]] } },
    { id: 'old', route: {} },
  ];
  const alerts = inspectSavedTrips(trips, snapshot, now);
  assert.deepEqual(Object.keys(alerts), ['hit']);
  assert.equal(alerts.hit[0].id, 'closure');
  assert.equal(alertFingerprint(alerts.hit), alertFingerprint([...alerts.hit].reverse()));
  assert.throws(() => inspectSavedTrips(trips, snapshot, now + 31 * 60000), /CONSTRUCTION_UNAVAILABLE/);
});

test('notify hook sends the supported title and content payload', t => {
  const old = globalThis.window;
  t.after(() => { globalThis.window = old; });
  let sent;
  globalThis.window = { flutterObject: { postMessage: message => { sent = JSON.parse(message); } } };
  assert.equal(notifyTownPass('路線受影響', '請查看收藏'), true);
  assert.deepEqual(sent, { name: 'notify', data: { title: '路線受影響', content: '請查看收藏' } });
  globalThis.window = {};
  assert.equal(notifyTownPass('路線受影響', '請查看收藏'), false);
});
