import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { defineConfig, type Plugin } from "vite";

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
    gzipAssets(),
  ],
  resolve: { tsconfigPaths: true },
  server: { host: true, port: 5173, strictPort: true },
});
