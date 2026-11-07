import { createRouter } from "./routing.mjs";
import { gunzipSync } from "fflate";
import { validateNetwork } from "./network-contract.mjs";
import { createOfficialRouteVerifier } from './verify-official-route.mjs';
let router, verifyOfficial, initialization;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      initialization = (async () => {
      const r = await fetch(data.url);
      if (!r.ok) throw Error("graph");
      const bytes = new Uint8Array(await r.arrayBuffer());
      const graph =
        bytes[0] === 31 && bytes[1] === 139
          ? JSON.parse(new TextDecoder().decode(gunzipSync(bytes)))
          : JSON.parse(new TextDecoder().decode(bytes));
      validateNetwork(graph);
      router = createRouter(graph);
      verifyOfficial = createOfficialRouteVerifier(graph);
      })();
      await initialization;
      postMessage({ type: "ready" });
    } else if (data.type === 'verify-official') {
      await initialization;
      if (!verifyOfficial) throw Error('UNVERIFIED_NETWORK');
      postMessage({type:'verified-official',id:data.id,result:verifyOfficial(data.route,data.start,data.end)});
    } else if (data.type === "route") {
      if (!router) throw Error("not ready");
      postMessage({
        type: "route",
        id: data.id,
        result: router(data.start, data.end, data.options),
      });
    }
  } catch (e) {
    postMessage({ type: "error", id: data.id, message: e.message });
  }
};
