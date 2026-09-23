import { serve } from "bun";
import index from "./index.html";

serve({
  port: 5173,
  routes: {
    "/*": index,
    // Served by the frontend's Nginx in production
    "/config.json": Response.json({
      sitesOrigin: process.env.REDOOST_SITES_ORIGIN ?? null,
    }),
  },
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
  },
});
