import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  base: "/race/",
  plugins: [
    wasm(),
    topLevelAwait()
  ],
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id): string | undefined {
          if (id.includes("node_modules/@dimforge/rapier3d")) {
            return "vendor-rapier";
          }
          if (id.includes("node_modules/three/examples")) {
            return "vendor-three-extras";
          }
          if (id.includes("node_modules/three")) {
            return "vendor-three";
          }
          if (id.includes("node_modules")) {
            return "vendor";
          }
          return undefined;
        }
      }
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true
  }
});
