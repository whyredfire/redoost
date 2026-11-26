import type { ComponentProps } from "@solidjs/web";
import * as MenuPrimitive from "@ui-sdk/solid/menu";
import { omit } from "solid-js";

import { cn } from "@/lib/cn";

const DropdownMenu = MenuPrimitive.Menu;

const DropdownMenuTrigger = MenuPrimitive.MenuTrigger;

const DropdownMenuContent = (
  props: ComponentProps<typeof MenuPrimitive.MenuContent> & { class?: string }
) => {
  const others = omit(props, "class");

  return (
    <MenuPrimitive.MenuContent
      sideOffset={4}
      class={cn(
        "rounded-menu bg-popover text-popover-foreground shadow-float z-50 max-h-(--available-height) min-w-[8rem] origin-(--transform-origin) overflow-x-hidden overflow-y-auto p-1 transition-[opacity,scale,translate] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:-translate-y-2 data-starting-style:scale-95 data-starting-style:opacity-0",
        props.class
      )}
      {...others}
    />
  );
};

const DropdownMenuItem = (
  props: ComponentProps<typeof MenuPrimitive.MenuItem> & {
    class?: string;
    inset?: boolean;
    variant?: "default" | "destructive";
  }
) => {
  const others = omit(props, "class", "inset", "variant");

  return (
    <MenuPrimitive.MenuItem
      data-inset={props.inset ? "" : undefined}
      data-variant={props.variant ?? "default"}
      class={cn(
        "data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:data-highlighted:bg-destructive/10 data-[variant=destructive]:data-highlighted:text-destructive dark:data-[variant=destructive]:data-highlighted:bg-destructive/20 [&_svg:not([class*='text-'])]:text-muted-foreground data-[variant=destructive]:*:[svg]:text-destructive! relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        props.class
      )}
      {...others}
    />
  );
};

const DropdownMenuLabel = (
  props: ComponentProps<"div"> & {
    inset?: boolean;
  }
) => {
  const others = omit(props, "class", "inset");

  return (
    <div
      data-slot="dropdown-menu-label"
      data-inset={props.inset ? "" : undefined}
      class={cn(
        "px-2 py-1.5 text-sm font-medium data-[inset]:pl-8",
        props.class
      )}
      {...others}
    />
  );
};

const DropdownMenuSeparator = (
  props: ComponentProps<typeof MenuPrimitive.MenuSeparator> & {
    class?: string;
  }
) => {
  const others = omit(props, "class");

  return (
    <MenuPrimitive.MenuSeparator
      class={cn("bg-border -mx-1 my-1 h-px", props.class)}
      {...others}
    />
  );
};

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
};
