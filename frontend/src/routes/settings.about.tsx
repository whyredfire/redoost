import { createFileRoute } from "@tanstack/solid-router";
import { AboutSections } from "@/components/about-sections";

export const Route = createFileRoute("/settings/about")({
  head: () => ({ meta: [{ title: "About · redoost" }] }),
  component: AboutSections,
});
