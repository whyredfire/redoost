import { serve } from "bun";
import index from "./index.html";

serve({
  port: 5173,
  routes: {
    "/api/*": (request) => {
      const url = new URL(request.url);
      const target = new URL(
        url.pathname + url.search,
        "http://127.0.0.1:8000",
      );
      return fetch(new Request(target, request));
    },
    "/*": index,
  },
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
  },
});
