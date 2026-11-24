import type { JSX } from "@solidjs/web";
import { Show, children } from "solid-js";

type PageHeadingProps = {
  title: string;
  children?: JSX.Element;
  action?: JSX.Element;
};

export function PageHeading(props: PageHeadingProps) {
  const content = children(() => props.children);
  return (
    <div class="mb-8 flex items-end justify-between gap-4">
      <div>
        <h1 class="text-3xl font-semibold tracking-tighter sm:text-4xl">
          {props.title}
        </h1>
        <Show when={content()}>
          <p class="mt-2 text-muted-foreground">{content()}</p>
        </Show>
      </div>
      {props.action}
    </div>
  );
}
