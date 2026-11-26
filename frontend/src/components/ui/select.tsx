import type { ComponentProps, JSX } from "@solidjs/web";
import * as SelectPrimitive from "@ui-sdk/solid/select";
import { omit } from "solid-js";

import { CheckIcon, ChevronDownIcon } from "@/components/icons";
import { cn } from "@/lib/cn";

const { Select } = SelectPrimitive;

const { SelectValue } = SelectPrimitive;

const { SelectGroup } = SelectPrimitive;

const SelectTrigger = (
  props: ComponentProps<typeof SelectPrimitive.SelectTrigger> & {
    class?: string;
    size?: "sm" | "default";
    children?: JSX.Element;
  }
) => {
  const others = omit(props, "class", "size", "children");

  return (
    <SelectPrimitive.SelectTrigger
      data-size={props.size ?? "default"}
      class={cn(
        "rounded-control bg-surface shadow-raised focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='text-'])]:text-muted-foreground flex w-fit items-center justify-between gap-2 px-3 py-2 text-sm whitespace-nowrap transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        props.class
      )}
      {...others}
    >
      {props.children}
      <ChevronDownIcon class="size-4 opacity-50" />
    </SelectPrimitive.SelectTrigger>
  );
};

const SelectContent = (
  props: ComponentProps<typeof SelectPrimitive.SelectContent> & {
    class?: string;
  }
) => {
  const others = omit(props, "class");

  return (
    <SelectPrimitive.SelectContent
      sideOffset={4}
      class={cn(
        "rounded-menu bg-popover text-popover-foreground shadow-float z-50 max-h-(--available-height) min-w-[max(8rem,var(--anchor-width))] origin-(--transform-origin) overflow-x-hidden overflow-y-auto p-1 transition-[opacity,scale] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
        props.class
      )}
      {...others}
    />
  );
};

const SelectGroupLabel = (
  props: ComponentProps<typeof SelectPrimitive.SelectGroupLabel> & {
    class?: string;
  }
) => {
  const others = omit(props, "class");

  return (
    <SelectPrimitive.SelectGroupLabel
      class={cn("text-muted-foreground px-2 py-1.5 text-xs", props.class)}
      {...others}
    />
  );
};

const SelectItem = (
  props: ComponentProps<typeof SelectPrimitive.SelectItem> & {
    class?: string;
    children?: JSX.Element;
  }
) => {
  const others = omit(props, "class", "children");

  return (
    <SelectPrimitive.SelectItem
      class={cn(
        "data-highlighted:bg-accent data-highlighted:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        props.class
      )}
      {...others}
    >
      <span class="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.SelectItemIndicator>
          <CheckIcon class="size-4" />
        </SelectPrimitive.SelectItemIndicator>
      </span>
      <span>{props.children}</span>
    </SelectPrimitive.SelectItem>
  );
};

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectTrigger,
  SelectValue,
};
