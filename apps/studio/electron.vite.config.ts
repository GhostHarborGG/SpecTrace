import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: { input: { index: resolve("src/main/index.ts") } }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve("src/preload/index.ts") },
        // .mjs so Electron loads the sandboxed preload as an ES module,
        // matching the path registered in main/index.ts.
        output: { format: "es", entryFileNames: "[name].mjs" }
      }
    }
  },
  renderer: {
    root: resolve("src/renderer"),
    plugins: [react()],
    build: {
      // Explicit: with `root` pointing into src/renderer, a relative outDir
      // would resolve against that root and land outside the package.
      outDir: resolve("out/renderer"),
      emptyOutDir: true,
      rollupOptions: { input: { index: resolve("src/renderer/index.html") } }
    }
  }
});
