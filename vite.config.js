import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import routeHandler from "./api/accessible-route.js";
import constructionHandler from './api/construction.js';
import landmarkHandler from './api/landmark-search.js';
const installRoute = server => { server.middlewares.use("/api/accessible-route", routeHandler); server.middlewares.use('/api/construction',constructionHandler); server.middlewares.use('/api/landmark-search',landmarkHandler); };
export default defineConfig({
  plugins: [react(), { name: "accessible-route-api", configureServer: installRoute, configurePreviewServer: installRoute }],
  base: "./",
  server: { port: 5173, strictPort: true },
  build: { chunkSizeWarningLimit: 650 },
});
