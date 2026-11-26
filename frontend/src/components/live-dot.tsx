import { Show } from "solid-js";

import { cn } from "@/lib/cn";

interface LiveDotProps {
  pulse?: boolean;
  off?: boolean;
}

export const LiveDot = (props: LiveDotProps) => (
  <span aria-hidden="true" class="relative flex size-2 shrink-0">
    <Show when={props.pulse}>
      <span class="bg-brand absolute size-full rounded-full opacity-60 motion-safe:animate-ping" />
    </Show>
    <span
      class={cn(
        "relative size-2 rounded-full",
        props.off ? "bg-muted-foreground/40" : "bg-brand"
      )}
    />
  </span>
);
