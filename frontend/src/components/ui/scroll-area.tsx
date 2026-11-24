import { cn } from "cn"
import { omit } from "solid-js"
import type { ComponentProps } from "@solidjs/web"

// Kobalte has no scroll area, so this keeps the native scrollbar
function ScrollArea(props: ComponentProps<"div">) {
  const others = omit(props, "class", "children")
  return (
    <div data-slot="scroll-area" class={cn("relative", props.class)} {...others}>
      <div
        data-slot="scroll-area-viewport"
        class="size-full overflow-auto rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1"
      >
        {props.children}
      </div>
    </div>
  )
}

export { ScrollArea }
