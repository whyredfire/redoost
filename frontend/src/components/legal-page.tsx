import type { JSX } from "@solidjs/web";
import { PageHeading } from "@/components/page-heading";

const contact = "whyredfire@gmail.com";

export function ContactLink() {
  return (
    <a
      class="underline underline-offset-4 hover:text-foreground"
      href={`mailto:${contact}`}
    >
      {contact}
    </a>
  );
}

type LegalPageProps = {
  title: string;
  updated: string;
  children: JSX.Element;
};

export function LegalPage(props: LegalPageProps) {
  return (
    <article>
      <PageHeading title={props.title}>
        Last updated {props.updated}
      </PageHeading>
      {props.children}
    </article>
  );
}

export function Section(props: { title: string; children: JSX.Element }) {
  return (
    <section class="mt-8 first-of-type:mt-0">
      <h2 class="font-semibold">{props.title}</h2>
      <div class="mt-2 space-y-2 text-muted-foreground">{props.children}</div>
    </section>
  );
}
