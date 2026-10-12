import type { ReactNode } from "react";

type PageHeadingProps = { title: string; children?: ReactNode };

export function PageHeading({ title, children }: PageHeadingProps) {
  return (
    <div className="mb-8">
      <h1 className="text-3xl font-semibold tracking-tighter sm:text-4xl">
        {title}
      </h1>
      {children && <p className="mt-2 text-muted-foreground">{children}</p>}
    </div>
  );
}
