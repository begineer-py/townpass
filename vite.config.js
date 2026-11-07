import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import routeHandler from "./api/accessible-route.js";
import constructionHandler from './api/construction.js';
const installRoute = server => { server.middlewares.use("/api/accessible-route", routeHandler); server.middlewares.use('/api/construction',constructionHandler); };
// npm run dev:https：手機用區網 IP 測試時需要 HTTPS，瀏覽器才允許定位（自簽憑證，第一次開啟要選「繼續前往」）。
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    { name: "accessible-route-api", configureServer: installRoute, configurePreviewServer: installRoute },
    mode === "https" && basicSsl({ name: "haohao-local" }),
  ],
  base: "./",
  server: { port: 5173, strictPort: true },
  build: { chunkSizeWarningLimit: 650 },
}));
