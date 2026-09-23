import { serve } from "bun";
import index from "./index.html";

serve({
  port: 5173,
  routes: {
    "/*": index,
  },
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
  },
});
