import type { ReactNode } from "react";

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
    <article className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Last updated {updated}
      </p>
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
    <section className="mt-8">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-2 space-y-2 text-muted-foreground">{children}</div>
    </section>
  );
}
