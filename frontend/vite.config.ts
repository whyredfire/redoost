import { readdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

import solid from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

import { renderOgImage } from "./og.ts";

const configJson = () =>
  ({
    name: "redoost-config-json",
    configureServer(server) {
      server.middlewares.use("/config.json", (_request, response) => {
        response.setHeader("Content-Type", "application/json");
        response.end(
          JSON.stringify({
            sitesOrigin: process.env.REDOOST_SITES_ORIGIN ?? null,
          })
        );
      });
    },
  }) satisfies Plugin;

const ogImage = () =>
  ({
    name: "redoost-og-image",
    configureServer(server) {
      server.middlewares.use("/og.png", async (_request, response) => {
        response.setHeader("Content-Type", "image/png");
        response.end(await renderOgImage());
      });
    },
    async generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "og.png",
        source: await renderOgImage(),
      });
    },
  }) satisfies Plugin;

const gzipAssets = () =>
  ({
    name: "redoost-gzip-assets",
    apply: "build",
    async closeBundle() {
      const files = await readdir("dist", { recursive: true });

      // WARNING: index.html must stay uncompressed so Nginx's sub_filter can rewrite it
      await Promise.all(
        files
          .filter((name) => /\.(?:js|css|svg|txt)$/u.test(name))
          .map(async (file) => {
            const contents = await readFile(`dist/${file}`);
            await writeFile(
              `dist/${file}.gz`,
              gzipSync(contents, { level: 9 })
            );
          })
      );
    },
  }) satisfies Plugin;

export default defineConfig({
  plugins: [
    // WARNING: must come before the Solid plugin
    tanstackRouter({ target: "solid", autoCodeSplitting: true }),
    solid(),
    tailwindcss(),
    configJson(),
    ogImage(),
    gzipAssets(),
  ],
  resolve: { tsconfigPaths: true },
  server: { host: true, port: 5173, strictPort: true },
});
