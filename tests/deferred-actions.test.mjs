import test from "node:test";
import assert from "node:assert/strict";
import { createDeferredActions } from "../src/deferred-actions.mjs";

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}

test("concurrent data requests share one load and reuse its result", async () => {
  let calls = 0;
  const gate = deferred();
  const actions = createDeferredActions(() => { calls++; return gate.promise; });
  const first = actions.ensure(), second = actions.ensure();
  gate.resolve({id: 42});
  assert.deepEqual(await first, {id: 42});
  assert.deepEqual(await second, {id: 42});
  assert.deepEqual(await actions.ensure(), {id: 42});
  assert.equal(calls, 1);
});

test("failed loads retry the still-current action with fresh data", async () => {
  let calls = 0, executed = 0;
  const actions = createDeferredActions(() => {
    if (++calls === 1) throw Error("offline");
    return "data";
  });
  const first = await actions.run({execute: data => { executed++; return data; }});
  assert.equal(first.status, "failed");
  assert.deepEqual(await actions.retry(), {status:"completed", value:"data"});
  assert.equal(calls, 2);
  assert.equal(executed, 1);
});

test("new intent and explicit cancellation prevent stale actions or retries", async () => {
  const gate = deferred(), completed = [];
  const actions = createDeferredActions(() => gate.promise);
  const first = actions.run({execute: () => completed.push("old")});
  const second = actions.run({execute: () => completed.push("new")});
  gate.resolve("data");
  assert.equal((await first).status, "cancelled");
  assert.equal((await second).status, "completed");
  assert.deepEqual(completed, ["new"]);
  const other = createDeferredActions(() => { throw Error("offline"); });
  assert.equal((await other.run({execute: () => completed.push("cancelled")})).status, "failed");
  other.cancel();
  assert.equal((await other.retry()).status, "cancelled");
  assert.deepEqual(completed, ["new"]);
});

for (const order of ["data-first", "worker-first"]) {
  test(`action waits for data and worker regardless of completion order: ${order}`, async () => {
    const data = deferred(), worker = deferred(), completed = [];
    const actions = createDeferredActions(() => data.promise);
    const result = actions.run({ready: () => worker.promise, execute: value => completed.push(value)});
    if (order === "data-first") data.resolve("data"); else worker.resolve();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(completed, []);
    if (order === "data-first") worker.resolve(); else data.resolve("data");
    assert.equal((await result).status, "completed");
    assert.deepEqual(completed, ["data"]);
  });
}

for (const change of ["tab", "endpoint"]) {
  test(`changing ${change} cancels a pending route but retains the shared load`, async () => {
    const data = deferred(), worker = deferred(), completed = [];
    let calls = 0;
    const actions = createDeferredActions(() => { calls++; return data.promise; });
    const old = actions.run({ready: () => worker.promise, execute: () => completed.push("old route")});
    actions.cancel();
    const current = actions.run({ready: () => worker.promise, execute: () => completed.push("current route")});
    worker.resolve();
    data.resolve("data");
    assert.equal((await old).status, "cancelled");
    assert.equal((await current).status, "completed");
    assert.equal(calls, 1);
    assert.deepEqual(completed, ["current route"]);
  });
}

test("failure after a newer intent starts cannot replace its retry", async () => {
  const oldReady = deferred(), currentReady = deferred();
  let attempts = 0;
  const actions = createDeferredActions(() => "data");
  const old = actions.run({ready: () => oldReady.promise, execute: () => "old"});
  const current = actions.run({ready: () => ++attempts === 1 ? currentReady.promise : Promise.resolve(), execute: () => "new"});
  oldReady.reject(Error("old failed"));
  currentReady.reject(Error("new failed"));
  assert.equal((await old).status, "cancelled");
  assert.equal((await current).status, "failed");
  assert.deepEqual(await actions.retry(), {status:"completed", value:"new"});
});
