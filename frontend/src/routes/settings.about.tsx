import { createFileRoute } from "@tanstack/react-router";
import { AboutSections } from "@/components/about-sections";

export const Route = createFileRoute("/settings/about")({
  head: () => ({ meta: [{ title: "About · redoost" }] }),
  component: AboutSections,
});
