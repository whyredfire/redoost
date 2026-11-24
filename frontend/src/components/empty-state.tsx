import type { JSX } from "@solidjs/web";
import { Dynamic } from "@solidjs/web";
import { cn } from "cn";
import type { LucideIcon } from "@/components/icons";

function EmptyStateIcon(props: { icon: LucideIcon }) {
  return (
    <div class="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
      <Dynamic component={props.icon} class="size-5 text-muted-foreground" />
    </div>
  );
}

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  class?: string;
  children: JSX.Element;
};

export function EmptyState(props: EmptyStateProps) {
  return (
    <div
      class={cn(
        "flex flex-col items-center rounded-xl border px-6 py-12 text-center",
        props.class,
      )}
    >
      <EmptyStateIcon icon={props.icon} />
      <p class="text-lg font-medium">{props.title}</p>
      <p class="mt-1 mb-6 text-sm text-muted-foreground">{props.description}</p>
      {props.children}
    </div>
  );
}
