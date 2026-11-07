import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createTripAlertLedger } from '../../src/trip-alert-ledger.mjs';

// Execute the current effect body with controlled dependencies. No network,
// real storage, timer, or TownPass notification is used.
const source = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');
const start = source.indexOf('  useEffect(() => {\n    if (!profileReady || !trips.length)');
const endMarker = '  }, [profileReady, profileStorageKey, trips]);';
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0) {
  throw new Error('Saved-trip effect was not found; update this reproduction for the current implementation.');
}
const effect = source.slice(start, end) + endMarker;
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness(fetchConstruction) {
  const result = { notifications: 0, failedWrites: 0, timer: null };
  const context = {
    useEffect: callback => callback(),
    profileReady: true,
    profileStorageKey: 'test-profile',
    trips: [{ id: 'trip', start: { name: 'A' }, end: { name: 'B' } }],
    document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    window: { addEventListener() {}, removeEventListener() {} },
    AbortController,
    setInterval: callback => { result.timer = callback; return 1; },
    clearInterval() {},
    fetchConstruction,
    inspectSavedTrips: () => ({ trip: [{ id: 'work', address: '測試路' }] }),
    alertFingerprint: () => 'same-work',
    readSaved: () => ({}),
    saveLocal: () => { result.failedWrites++; return false; },
    notifyTownPass: () => { result.notifications++; return true; },
    setTripAlerts() {},
    setTripCheckFailed() {},
  };
  context.tripAlertLedger = {current: createTripAlertLedger(context.readSaved, context.saveLocal)};
  runInNewContext(effect, context);
  return { context, result };
}

test('failed fingerprint persistence does not resend the same alert on the next poll', async () => {
  const { result } = harness(async () => ({}));
  await flush();
  assert.equal(result.notifications, 1);
  await result.timer();
  assert.ok(result.failedWrites >= 1, 'the test must exercise a failed persistence attempt');
  assert.equal(result.notifications, 1, 'same-page retries should not repeat an already sent notification');
});

test('a page hidden while the fetch is pending does not send a foreground alert', async () => {
  let resolveFetch;
  const { context, result } = harness(() => new Promise(resolve => { resolveFetch = resolve; }));
  context.document.visibilityState = 'hidden';
  resolveFetch({});
  await flush();
  assert.equal(result.notifications, 0, 'check visibility again when the fetch finishes');
});
