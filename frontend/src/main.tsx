import { RouterProvider, createRouter } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@cloudflare/kumo/components/tooltip";
import { UploadProvider } from "@/lib/upload";
import { routeTree } from "./routeTree.gen";
import "../styles/globals.css";

const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <UploadProvider>
      <TooltipProvider>
        <RouterProvider router={router} />
      </TooltipProvider>
    </UploadProvider>
  </StrictMode>,
);
