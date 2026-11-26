import { render } from "@solidjs/web";
import { RouterProvider, createRouter } from "@tanstack/solid-router";

import { UploadProvider } from "@/lib/upload";

import { routeTree } from "./routeTree.gen";

import "../styles/globals.css";

const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/solid-router" {
  interface Register {
    router: typeof router;
  }
}

const root = document.querySelector("#root");

if (root) {
  render(
    () => (
      <UploadProvider>
        <RouterProvider router={router} />
      </UploadProvider>
    ),
    root
  );
}
