import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: resolve(packageRoot, "demo"),
  base: "./",
  build: {
    emptyOutDir: true,
    outDir: resolve(packageRoot, "demo-dist"),
    sourcemap: true,
  },
});
