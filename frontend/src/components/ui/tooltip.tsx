import { cn } from "cn"
import * as TooltipPrimitive from "@kobalte/core/tooltip"
import type { PolymorphicProps } from "@kobalte/core/polymorphic"
import { omit } from "solid-js"
import type { ValidComponent } from "@solidjs/web"

// Radix's defaults: no open delay (was TooltipProvider's delayDuration), closing at once, above the trigger, 4px away
function Tooltip(props: TooltipPrimitive.TooltipRootProps) {
  return (
    <TooltipPrimitive.Root
      openDelay={0}
      closeDelay={0}
      placement="top"
      gutter={4}
      {...props}
    />
  )
}

function TooltipTrigger<T extends ValidComponent = "button">(
  props: PolymorphicProps<T, TooltipPrimitive.TooltipTriggerProps<T>>
) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent(
  props: PolymorphicProps<"div", TooltipPrimitive.TooltipContentProps<"div">>
) {
  const others = omit(props, "class")
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        class={cn(
          // Kobalte doesn't expose the side, so this slides in as from above the trigger
          "z-50 w-fit origin-(--kb-tooltip-content-transform-origin) animate-in rounded-chip bg-foreground px-3 py-1.5 text-xs text-balance text-background fade-in-0 zoom-in-95 slide-in-from-bottom-2 data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95",
          props.class
        )}
        {...others}
      />
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent }
