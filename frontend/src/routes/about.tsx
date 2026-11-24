import { createFileRoute } from "@tanstack/solid-router";
import { AboutSections } from "@/components/about-sections";
import { PageHeading } from "@/components/page-heading";

export const Route = createFileRoute("/about")({
  head: () => ({ meta: [{ title: "About · redoost" }] }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <>
      <PageHeading title="About" />
      <AboutSections />
    </>
  );
}
