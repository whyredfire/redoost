import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { defineConfig, type Plugin } from "vite";
import { renderOgImage } from "./og.tsx";

// Served by the frontend's Nginx in production
function configJson(): Plugin {
  return {
    name: "redoost-config-json",
    configureServer(server) {
      server.middlewares.use("/config.json", (_request, response) => {
        response.setHeader("Content-Type", "application/json");
        response.end(
          JSON.stringify({
            sitesOrigin: process.env.REDOOST_SITES_ORIGIN ?? null,
          }),
        );
      });
    },
  };
}

// The link preview image, rendered with Takumi rather than kept as a screenshot
function ogImage(): Plugin {
  return {
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
  };
}

// Pre-compressed copies for Nginx's gzip_static; index.html stays plain so sub_filter can rewrite it
function gzipAssets(): Plugin {
  return {
    name: "redoost-gzip-assets",
    apply: "build",
    async closeBundle() {
      const files = await readdir("dist", { recursive: true });
      for (const file of files.filter((name) =>
        /\.(js|css|svg|txt)$/.test(name),
      )) {
        const contents = await readFile(`dist/${file}`);
        await writeFile(`dist/${file}.gz`, gzipSync(contents, { level: 9 }));
      }
    },
  };
}

export default defineConfig({
  plugins: [
    // Must come before the React plugin
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    configJson(),
    ogImage(),
    gzipAssets(),
  ],
  resolve: { tsconfigPaths: true },
  server: { host: true, port: 5173, strictPort: true },
});
