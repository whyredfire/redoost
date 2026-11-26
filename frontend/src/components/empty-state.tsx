import type { JSX } from "@solidjs/web";
import { Dynamic } from "@solidjs/web";
import { cn } from "cn";

import type { LucideIcon } from "@/components/icons";

const EmptyStateIcon = (props: { icon: LucideIcon }) => (
  <div class="bg-muted mb-4 flex size-12 items-center justify-center rounded-full">
    <Dynamic component={props.icon} class="text-muted-foreground size-5" />
  </div>
);

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  class?: string;
  children: JSX.Element;
}

export const EmptyState = (props: EmptyStateProps) => (
  <div
    class={cn(
      "flex flex-col items-center rounded-xl border px-6 py-12 text-center",
      props.class
    )}
  >
    <EmptyStateIcon icon={props.icon} />
    <p class="text-lg font-medium">{props.title}</p>
    <p class="text-muted-foreground mt-1 mb-6 text-sm">{props.description}</p>
    {props.children}
  </div>
);
