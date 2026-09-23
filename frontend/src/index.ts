import { serve } from "bun";
import index from "./index.html";

serve({
  routes: {
    "/*": index,
  },
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
  },
});
