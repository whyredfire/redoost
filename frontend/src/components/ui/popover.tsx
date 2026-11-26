import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import * as PopoverPrimitive from "@kobalte/core/popover";
import type { ComponentProps, ValidComponent } from "@solidjs/web";
import { omit } from "solid-js";

import { cn } from "@/lib/cn";

const Popover = (props: PopoverPrimitive.PopoverRootProps) => (
  <PopoverPrimitive.Root gutter={4} {...props} />
);

const PopoverTrigger = <T extends ValidComponent = "button">(
  props: PolymorphicProps<T, PopoverPrimitive.PopoverTriggerProps<T>>
) => <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;

const PopoverContent = (
  props: PolymorphicProps<"div", PopoverPrimitive.PopoverContentProps<"div">>
) => {
  const others = omit(props, "class");

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        class={cn(
          "rounded-menu bg-popover text-popover-foreground shadow-float slide-in-from-top-2 data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95 data-[expanded]:animate-in data-[expanded]:fade-in-0 data-[expanded]:zoom-in-95 z-50 w-72 origin-(--kb-popover-content-transform-origin) p-4 outline-hidden",
          props.class
        )}
        {...others}
      />
    </PopoverPrimitive.Portal>
  );
};

const PopoverAnchor = (
  props: PolymorphicProps<"div", PopoverPrimitive.PopoverAnchorProps<"div">>
) => <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;

const PopoverHeader = (props: ComponentProps<"div">) => {
  const others = omit(props, "class");

  return (
    <div
      data-slot="popover-header"
      class={cn("flex flex-col gap-1 text-sm", props.class)}
      {...others}
    />
  );
};

const PopoverTitle = (props: ComponentProps<"div">) => {
  const others = omit(props, "class");

  return (
    <div
      data-slot="popover-title"
      class={cn("font-medium", props.class)}
      {...others}
    />
  );
};

const PopoverDescription = (props: ComponentProps<"p">) => {
  const others = omit(props, "class");

  return (
    <p
      data-slot="popover-description"
      class={cn("text-muted-foreground", props.class)}
      {...others}
    />
  );
};

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
};
