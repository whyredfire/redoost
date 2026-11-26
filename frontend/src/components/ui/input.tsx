import type { ComponentProps } from "@solidjs/web";
import { cn } from "cn";
import { omit } from "solid-js";

const Input = (props: ComponentProps<"input">) => {
  const others = omit(props, "class");

  return (
    <input
      data-slot="input"
      class={cn(
        "rounded-control border-input bg-surface selection:bg-primary selection:text-primary-foreground file:text-foreground placeholder:text-muted-foreground dark:bg-input/30 h-9 w-full min-w-0 border px-3 py-1 text-base transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:shadow-field focus-visible:border-transparent",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        props.class
      )}
      {...others}
    />
  );
};

export { Input };
