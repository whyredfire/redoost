import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import * as TooltipPrimitive from "@kobalte/core/tooltip";
import type { ValidComponent } from "@solidjs/web";
import { cn } from "cn";
import { omit } from "solid-js";

const Tooltip = (props: TooltipPrimitive.TooltipRootProps) => (
  <TooltipPrimitive.Root
    openDelay={0}
    closeDelay={0}
    placement="top"
    gutter={4}
    {...props}
  />
);

const TooltipTrigger = <T extends ValidComponent = "button">(
  props: PolymorphicProps<T, TooltipPrimitive.TooltipTriggerProps<T>>
) => <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;

const TooltipContent = (
  props: PolymorphicProps<"div", TooltipPrimitive.TooltipContentProps<"div">>
) => {
  const others = omit(props, "class");

  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        class={cn(
          "animate-in rounded-chip bg-foreground text-background fade-in-0 zoom-in-95 slide-in-from-bottom-2 data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95 z-50 w-fit origin-(--kb-tooltip-content-transform-origin) px-3 py-1.5 text-xs text-balance",
          props.class
        )}
        {...others}
      />
    </TooltipPrimitive.Portal>
  );
};

export { Tooltip, TooltipTrigger, TooltipContent };
