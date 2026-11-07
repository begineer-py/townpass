import test from "node:test";
import assert from "node:assert/strict";
import { createTripAlertLedger } from "../src/trip-alert-ledger.mjs";

test("failed persistence still remembers sent alerts across effect restarts", () => {
  let writes = 0;
  const ledger = createTripAlertLedger(() => ({}), () => { writes++; return false; });
  assert.deepEqual(ledger.get("profile-a"), {});
  assert.equal(ledger.save("profile-a", {trip:"work-1"}), false);
  assert.deepEqual(ledger.get("profile-a"), {trip:"work-1"});
  assert.equal(writes, 1);
});

test("fingerprints are scoped to profile and clearing allows a future new alert", () => {
  const ledger = createTripAlertLedger(key => key === "a" ? {trip:"old"} : {}, () => false);
  assert.deepEqual(ledger.get("a"), {trip:"old"});
  assert.deepEqual(ledger.get("b"), {});
  ledger.save("a", {});
  assert.deepEqual(ledger.get("a"), {});
  ledger.save("b", {trip:"new"});
  assert.deepEqual(ledger.get("a"), {});
});

test("callers cannot mutate a stored fingerprint without saving", () => {
  const ledger = createTripAlertLedger(() => ({trip:"first"}), () => true);
  ledger.get("a").trip = "changed";
  assert.equal(ledger.get("a").trip, "first");
  const next = {trip:"second"};
  ledger.save("a", next);
  next.trip = "changed";
  assert.equal(ledger.get("a").trip, "second");
});
