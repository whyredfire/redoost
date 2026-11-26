import type { ComponentProps } from "@solidjs/web";
import * as TooltipPrimitive from "@ui-sdk/solid/tooltip";
import { omit } from "solid-js";

import { cn } from "@/lib/cn";

const Tooltip = (props: TooltipPrimitive.TooltipProps) => (
  <TooltipPrimitive.Tooltip delay={0} {...props} />
);

const { TooltipTrigger } = TooltipPrimitive;

const TooltipContent = (
  props: ComponentProps<typeof TooltipPrimitive.TooltipContent> & {
    class?: string;
  }
) => {
  const others = omit(props, "class");

  return (
    <TooltipPrimitive.TooltipContent
      side="top"
      sideOffset={4}
      class={cn(
        "rounded-chip bg-foreground text-background z-50 w-fit origin-(--transform-origin) px-3 py-1.5 text-xs text-balance transition-[opacity,scale,translate] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:translate-y-2 data-starting-style:scale-95 data-starting-style:opacity-0",
        props.class
      )}
      {...others}
    />
  );
};

export { Tooltip, TooltipTrigger, TooltipContent };
