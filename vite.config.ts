import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Static build: the whole toolkit runs client-side, so any static host works.
// BASE lets the same build serve from a sub-path (GitHub Pages: /visual-toolkit/).
export default defineConfig({
  root: "app",
  base: process.env.BASE ?? "/",
  plugins: [react()],
  // One three.js instance: loaders importing "three" get the WebGPU build too.
  resolve: { alias: [{ find: /^three$/, replacement: "three/webgpu" }] },
  server: { host: "127.0.0.1" },
  preview: { host: "127.0.0.1" },
  build: { outDir: "../dist", emptyOutDir: true, target: "es2022", sourcemap: true },
});
