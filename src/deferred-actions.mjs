// Coordinate lazy data with another prerequisite (for example, route-worker
// readiness). Loading is shared; only the latest uncancelled intent may start.
export function createDeferredActions(load) {
  let cached, inFlight, generation = 0, retryIntent;
  function ensure() {
    if (cached !== undefined) return Promise.resolve(cached);
    if (inFlight) return inFlight;
    const task = Promise.resolve().then(load).then(value => {
      cached = value;
      return value;
    }).finally(() => {
      if (inFlight === task) inFlight = undefined;
    });
    inFlight = task;
    return task;
  }
  async function run(intent) {
    const version = ++generation;
    const isCurrent = () => version === generation;
    retryIntent = intent;
    let data;
    try {
      [data] = await Promise.all([ensure(), Promise.resolve().then(() => intent.ready?.())]);
    } catch (error) {
      return isCurrent() ? {status: "failed", error} : {status: "cancelled"};
    }
    if (!isCurrent()) return {status: "cancelled"};
    retryIntent = undefined;
    return {status: "completed", value: await intent.execute(data, isCurrent)};
  }
  function retry() {
    return retryIntent ? run(retryIntent) : Promise.resolve({status: "cancelled"});
  }
  function cancel() { generation++; retryIntent = undefined; }
  return {ensure, run, retry, cancel, peek: () => cached};
}
