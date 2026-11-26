import { readdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

import { defineConfig } from "@rsbuild/core";
import type { RsbuildPlugin } from "@rsbuild/core";
import { pluginSolid } from "@rsbuild/plugin-solid";
import tailwindcss from "@tailwindcss/postcss";
import { tanstackRouter } from "@tanstack/router-plugin/rspack";

import { renderOgImage } from "./og.ts";

const finishBuild = {
  name: "redoost-finish-build",
  setup(api) {
    api.onAfterBuild(async () => {
      const dist = api.context.distPath;
      await writeFile(`${dist}/og.png`, await renderOgImage());

      const files = await readdir(dist, { recursive: true });

      // WARNING: index.html must stay uncompressed so Nginx's sub_filter can rewrite it
      await Promise.all(
        files
          .filter((name) => /\.(?:js|css|svg|txt)$/u.test(name))
          .map(async (file) => {
            const contents = await readFile(`${dist}/${file}`);
            await writeFile(
              `${dist}/${file}.gz`,
              gzipSync(contents, { level: 9 })
            );
          })
      );
    });
  },
} satisfies RsbuildPlugin;

export default defineConfig({
  plugins: [pluginSolid(), finishBuild],
  source: { entry: { index: "./src/main.tsx" } },
  html: { template: "./index.html", favicon: "./src/favicon.svg" },
  server: {
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    setup({ server }) {
      server.middlewares.use("/config.json", (_request, response) => {
        response.setHeader("Content-Type", "application/json");
        response.end(
          JSON.stringify({
            sitesOrigin: process.env.REDOOST_SITES_ORIGIN ?? null,
          })
        );
      });
      server.middlewares.use("/og.png", async (_request, response) => {
        response.setHeader("Content-Type", "image/png");
        response.end(await renderOgImage());
      });
    },
  },
  tools: {
    // WARNING: absolute URLs point into public/, so leave them for the browser
    cssLoader: { url: { filter: (url: string) => !url.startsWith("/") } },
    postcss: { postcssOptions: { plugins: [tailwindcss()] } },
    rspack: {
      plugins: [tanstackRouter({ target: "solid", autoCodeSplitting: true })],
    },
  },
});
