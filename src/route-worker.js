import { createRouter } from "./routing.mjs";
import { gunzipSync } from "fflate";
import { validateNetwork } from "./network-contract.mjs";
import { createOfficialRouteVerifier } from './verify-official-route.mjs';
import {routeAroundConstruction} from './construction-routing.mjs';
import {createConstructionChecker} from './construction.mjs';
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
      const candidate=verifyOfficial(data.route,data.start,data.end);
      const result=candidate.error?candidate:routeAroundConstruction(candidate,data.start,data.end,data.options,data.construction,{router,verifyOfficial});
      postMessage({type:'verified-official',id:data.id,result});
    } else if (data.type === "route") {
      if (!router) throw Error("not ready");
      let checker;try{checker=createConstructionChecker(data.construction);}catch{postMessage({type:'route',id:data.id,result:{error:'CONSTRUCTION_UNAVAILABLE'}});return;}
      const candidate=router(data.start,data.end,data.options);
      const result=candidate.error?candidate:routeAroundConstruction(candidate,data.start,data.end,data.options,data.construction,{router,verifyOfficial});
      postMessage({
        type: "route",
        id: data.id,
        result,
      });
    }
  } catch (e) {
    postMessage({ type: "error", id: data.id, message: e.message });
  }
};
