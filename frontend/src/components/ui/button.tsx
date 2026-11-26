import type { ComponentProps } from "@solidjs/web";
import { cva } from "class-variance-authority";
import type { VariantProps } from "class-variance-authority";
import { omit } from "solid-js";

import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "sink rounded-control ease-detent focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 inline-flex shrink-0 items-center justify-center gap-2 text-sm font-medium whitespace-nowrap transition-[background-color,color,box-shadow,scale] duration-150 outline-none select-none focus-visible:ring-[3px] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90 shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_1px_2px_rgb(0_0_0/0.16)]",
        destructive:
          "chip text-danger focus-visible:ring-destructive/20 [--chip-wash:11%] [--chip:var(--danger)] hover:[--chip-wash:17%]",
        outline:
          "bg-surface text-ink shadow-raised hover:shadow-[var(--elev-raised-hover)]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "text-ink-2 hover:bg-surface-2 hover:text-ink active:bg-surface-3",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "rounded-chip h-6 gap-1 px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-[9px] px-3 has-[>svg]:px-2.5",
        lg: "rounded-row h-10 px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "rounded-chip size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const Button = (
  props: ComponentProps<"button"> & VariantProps<typeof buttonVariants>
) => {
  const others = omit(props, "class", "variant", "size");

  return (
    <button
      data-slot="button"
      data-variant={props.variant ?? "default"}
      data-size={props.size ?? "default"}
      class={cn(
        buttonVariants({
          variant: props.variant,
          size: props.size,
          className: props.class,
        })
      )}
      {...others}
    />
  );
};

export { Button, buttonVariants };
