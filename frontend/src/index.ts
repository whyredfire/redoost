import { serve } from "bun";
import index from "./index.html";

// The build copies public/ into dist/, where Nginx serves it
function publicFile(name: string) {
  return () =>
    new Response(Bun.file(`public/${name}`), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
}

serve({
  port: 5173,
  routes: {
    "/*": index,
    "/llms.txt": publicFile("llms.txt"),
    "/robots.txt": publicFile("robots.txt"),
    // Served by the frontend's Nginx in production
    "/config.json": Response.json({
      sitesOrigin: process.env.REDOOST_SITES_ORIGIN ?? null,
    }),
  },
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
  },
});
