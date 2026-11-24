import { cn } from "cn"
import * as PopoverPrimitive from "@kobalte/core/popover"
import type { PolymorphicProps } from "@kobalte/core/polymorphic"
import { omit } from "solid-js"
import type { ComponentProps, ValidComponent } from "@solidjs/web"

// Radix's sideOffset is Kobalte's gutter, set on the root
function Popover(props: PopoverPrimitive.PopoverRootProps) {
  return <PopoverPrimitive.Root gutter={4} {...props} />
}

function PopoverTrigger<T extends ValidComponent = "button">(
  props: PolymorphicProps<T, PopoverPrimitive.PopoverTriggerProps<T>>
) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent(
  props: PolymorphicProps<"div", PopoverPrimitive.PopoverContentProps<"div">>
) {
  const others = omit(props, "class")
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        class={cn(
          // Kobalte doesn't expose the side, so this slides in as from below the trigger
          "z-50 w-72 origin-(--kb-popover-content-transform-origin) rounded-menu bg-popover p-4 text-popover-foreground shadow-float outline-hidden slide-in-from-top-2 data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95 data-[expanded]:animate-in data-[expanded]:fade-in-0 data-[expanded]:zoom-in-95",
          props.class
        )}
        {...others}
      />
    </PopoverPrimitive.Portal>
  )
}

function PopoverAnchor(
  props: PolymorphicProps<"div", PopoverPrimitive.PopoverAnchorProps<"div">>
) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

function PopoverHeader(props: ComponentProps<"div">) {
  const others = omit(props, "class")
  return (
    <div
      data-slot="popover-header"
      class={cn("flex flex-col gap-1 text-sm", props.class)}
      {...others}
    />
  )
}

function PopoverTitle(props: ComponentProps<"div">) {
  const others = omit(props, "class")
  return (
    <div
      data-slot="popover-title"
      class={cn("font-medium", props.class)}
      {...others}
    />
  )
}

function PopoverDescription(props: ComponentProps<"p">) {
  const others = omit(props, "class")
  return (
    <p
      data-slot="popover-description"
      class={cn("text-muted-foreground", props.class)}
      {...others}
    />
  )
}

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
}
