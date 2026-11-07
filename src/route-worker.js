import { createRouter } from "./routing.mjs";
import { gunzipSync } from "fflate";
import { validateNetwork } from "./network-contract.mjs";
let router;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      const r = await fetch(data.url);
      if (!r.ok) throw Error("graph");
      const bytes = new Uint8Array(await r.arrayBuffer());
      const graph =
        bytes[0] === 31 && bytes[1] === 139
          ? JSON.parse(new TextDecoder().decode(gunzipSync(bytes)))
          : JSON.parse(new TextDecoder().decode(bytes));
      validateNetwork(graph);
      router = createRouter(graph);
      postMessage({ type: "ready", nodes: graph.nodes.length });
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
