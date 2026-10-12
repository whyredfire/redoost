import type { ReactNode } from "react";
import { PageHeading } from "@/components/page-heading";

export const contact = "whyredfire@gmail.com";

export function ContactLink() {
  return (
    <a
      className="underline underline-offset-4 hover:text-foreground"
      href={`mailto:${contact}`}
    >
      {contact}
    </a>
  );
}

type LegalPageProps = { title: string; updated: string; children: ReactNode };

export function LegalPage({ title, updated, children }: LegalPageProps) {
  return (
    <article>
      <PageHeading title={title}>Last updated {updated}</PageHeading>
      {children}
    </article>
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-8 first-of-type:mt-0">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-2 space-y-2 text-muted-foreground">{children}</div>
    </section>
  );
}
