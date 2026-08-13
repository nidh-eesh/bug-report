import { copyFile } from "node:fs/promises";

import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: false,
  entry: {
    index: "src/index.ts",
    core: "src/core.ts",
    "transports/http": "src/transports/http.ts",
    "transports/sentry": "src/transports/sentry.ts",
    "capture/display-media": "src/capture/display-media.ts",
    "capture/modern-screenshot": "src/capture/modern-screenshot.ts",
  },
  external: ["modern-screenshot", "react", "react-dom"],
  format: ["esm", "cjs"],
  minify: false,
  outExtension({ format }) {
    return { js: format === "cjs" ? ".cjs" : ".js" };
  },
  platform: "browser",
  sourcemap: true,
  splitting: false,
  target: "es2020",
  treeshake: true,
  async onSuccess() {
    await copyFile("src/style.css", "dist/style.css");
  },
});
