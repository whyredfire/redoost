import { createFileRoute } from "@tanstack/solid-router";

import { AboutSections } from "@/components/about-sections";
import { PageHeading } from "@/components/page-heading";

const AboutPage = () => (
  <>
    <PageHeading title="About" />
    <AboutSections />
  </>
);

export const Route = createFileRoute("/about")({
  head: () => ({ meta: [{ title: "About · redoost" }] }),
  component: AboutPage,
});
