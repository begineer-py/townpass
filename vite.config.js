import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import routeComputeHandler, {disposeRoutingResources} from "./api/route-compute.js";
import constructionHandler from './api/construction.js';
import landmarkHandler from './api/landmark-search.js';
import conditionDetailHandler from './api/official-condition-detail.js';
const installRoute = server => { server.httpServer?.once("close", disposeRoutingResources); server.middlewares.use("/api/route-compute", routeComputeHandler); server.middlewares.use('/api/construction',constructionHandler); server.middlewares.use('/api/landmark-search',landmarkHandler); server.middlewares.use('/api/official-condition-detail',conditionDetailHandler); };
// npm run dev:https：手機用區網 IP 測試時需要 HTTPS，瀏覽器才允許定位（自簽憑證，第一次開啟要選「繼續前往」）。
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    { name: "routing-api", configureServer: installRoute, configurePreviewServer: installRoute },
    mode === "https" && basicSsl({ name: "haohao-local" }),
  ],
  base: "./",
  server: { port: 5173, strictPort: true, watch: { ignored: ["**/data/processed", "**/data/processed/**", "**/data/raw", "**/data/raw/**"] } },
  build: { chunkSizeWarningLimit: 650 },
}));
