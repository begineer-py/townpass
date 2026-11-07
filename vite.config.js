import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import routeHandler from "./api/accessible-route.js";
import constructionHandler from './api/construction.js';
const installRoute = server => { server.middlewares.use("/api/accessible-route", routeHandler); server.middlewares.use('/api/construction',constructionHandler); };
export default defineConfig({
  plugins: [react(), { name: "accessible-route-api", configureServer: installRoute, configurePreviewServer: installRoute }],
  base: "./",
  server: { port: 5173, strictPort: true },
  build: { chunkSizeWarningLimit: 650 },
});
