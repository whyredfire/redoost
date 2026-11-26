import type { JSX } from "@solidjs/web";
import { Show, children } from "solid-js";

interface PageHeadingProps {
  title: string;
  children?: JSX.Element;
  action?: JSX.Element;
}

export const PageHeading = (props: PageHeadingProps) => {
  const content = children(() => props.children);

  return (
    <div class="mb-8 flex items-end justify-between gap-4">
      <div>
        <h1 class="text-3xl font-semibold tracking-tighter sm:text-4xl">
          {props.title}
        </h1>
        <Show when={content()}>
          <p class="text-muted-foreground mt-2">{content()}</p>
        </Show>
      </div>
      {props.action}
    </div>
  );
};
