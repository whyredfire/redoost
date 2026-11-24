import { cn } from "cn"
import { omit } from "solid-js"
import type { ComponentProps } from "@solidjs/web"

function Input(props: ComponentProps<"input">) {
  const others = omit(props, "class")
  return (
    <input
      data-slot="input"
      class={cn(
        "h-9 w-full min-w-0 rounded-control border border-input bg-surface px-3 py-1 text-base transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        "focus-visible:border-transparent focus-visible:shadow-field",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        props.class
      )}
      {...others}
    />
  )
}

export { Input }