import type { JSX } from "@solidjs/web";

import { PageHeading } from "@/components/page-heading";

const contact = "whyredfire@gmail.com";

export const ContactLink = () => (
  <a
    class="hover:text-foreground underline underline-offset-4"
    href={`mailto:${contact}`}
  >
    {contact}
  </a>
);

interface LegalPageProps {
  title: string;
  updated: string;
  children: JSX.Element;
}

export const LegalPage = (props: LegalPageProps) => (
  <article>
    <PageHeading title={props.title}>Last updated {props.updated}</PageHeading>
    {props.children}
  </article>
);

export const Section = (props: { title: string; children: JSX.Element }) => (
  <section class="mt-8 first-of-type:mt-0">
    <h2 class="font-semibold">{props.title}</h2>
    <div class="text-muted-foreground mt-2 space-y-2">{props.children}</div>
  </section>
);
