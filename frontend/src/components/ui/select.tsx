import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import * as SelectPrimitive from "@kobalte/core/select";
import type { ComponentProps } from "@solidjs/web";
import { omit } from "solid-js";

import { CheckIcon, ChevronDownIcon } from "@/components/icons";
import { cn } from "@/lib/cn";

const Select = <Option, OptGroup = never>(
  props: PolymorphicProps<
    "div",
    SelectPrimitive.SelectRootProps<Option, OptGroup, "div">
  >
) => (
  <SelectPrimitive.Root<Option, OptGroup, "div">
    data-slot="select"
    gutter={4}
    {...props}
  />
);

const SelectValue = <Option,>(
  props: PolymorphicProps<
    "span",
    SelectPrimitive.SelectValueProps<Option, "span">
  >
) => (
  <SelectPrimitive.Value<Option, "span"> data-slot="select-value" {...props} />
);

const SelectTrigger = (
  props: PolymorphicProps<
    "button",
    SelectPrimitive.SelectTriggerProps<"button">
  > & {
    size?: "sm" | "default";
  }
) => {
  const others = omit(props, "class", "size", "children");

  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={props.size ?? "default"}
      class={cn(
        "rounded-control bg-surface shadow-raised focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 has-data-[placeholder-shown]:text-muted-foreground dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='text-'])]:text-muted-foreground flex w-fit items-center justify-between gap-2 px-3 py-2 text-sm whitespace-nowrap transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        props.class
      )}
      {...others}
    >
      {props.children}
      <ChevronDownIcon class="size-4 opacity-50" />
    </SelectPrimitive.Trigger>
  );
};

const SelectContent = (
  props: PolymorphicProps<"div", SelectPrimitive.SelectContentProps<"div">>
) => {
  const others = omit(props, "class");

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        class={cn(
          "rounded-menu bg-popover text-popover-foreground shadow-float data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95 data-[expanded]:animate-in data-[expanded]:fade-in-0 data-[expanded]:zoom-in-95 relative z-50 max-h-(--kb-popper-content-available-height) min-w-[8rem] origin-(--kb-select-content-transform-origin) overflow-x-hidden overflow-y-auto",
          props.class
        )}
        {...others}
      >
        <SelectPrimitive.Listbox class="w-full min-w-(--kb-popper-anchor-width) scroll-my-1 p-1" />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
};

const SelectLabel = (
  props: PolymorphicProps<"li", SelectPrimitive.SelectSectionProps<"li">>
) => {
  const others = omit(props, "class");

  return (
    <SelectPrimitive.Section
      data-slot="select-label"
      class={cn("text-muted-foreground px-2 py-1.5 text-xs", props.class)}
      {...others}
    />
  );
};

const SelectItem = (
  props: PolymorphicProps<"li", SelectPrimitive.SelectItemProps<"li">>
) => {
  const others = omit(props, "class", "children");

  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      class={cn(
        "focus:bg-accent focus:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        props.class
      )}
      {...others}
    >
      <span
        data-slot="select-item-indicator"
        class="absolute right-2 flex size-3.5 items-center justify-center"
      >
        <SelectPrimitive.ItemIndicator as="span">
          <CheckIcon class="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemLabel as="span">
        {props.children}
      </SelectPrimitive.ItemLabel>
    </SelectPrimitive.Item>
  );
};

const SelectSeparator = (props: ComponentProps<"div">) => {
  const others = omit(props, "class");

  return (
    <div
      data-slot="select-separator"
      class={cn("bg-border pointer-events-none -mx-1 my-1 h-px", props.class)}
      {...others}
    />
  );
};

export {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
