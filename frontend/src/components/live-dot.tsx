import { cn } from "cn";
import { Show } from "solid-js";

type LiveDotProps = { pulse?: boolean; off?: boolean };

export function LiveDot(props: LiveDotProps) {
  return (
    <span aria-hidden="true" class="relative flex size-2 shrink-0">
      <Show when={props.pulse}>
        <span class="absolute size-full rounded-full bg-brand opacity-60 motion-safe:animate-ping" />
      </Show>
      <span
        class={cn(
          "relative size-2 rounded-full",
          props.off ? "bg-muted-foreground/40" : "bg-brand",
        )}
      />
    </span>
  );
}
