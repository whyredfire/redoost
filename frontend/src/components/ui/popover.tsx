import type { ComponentProps } from "@solidjs/web";
import * as PopoverPrimitive from "@ui-sdk/solid/popover";
import { omit } from "solid-js";

import { cn } from "@/lib/cn";

const { Popover } = PopoverPrimitive;

const { PopoverTrigger } = PopoverPrimitive;

const PopoverContent = (
  props: ComponentProps<typeof PopoverPrimitive.PopoverContent> & {
    class?: string;
  }
) => {
  const others = omit(props, "class");

  return (
    <PopoverPrimitive.PopoverContent
      sideOffset={4}
      class={cn(
        "rounded-menu bg-popover text-popover-foreground shadow-float z-50 w-72 origin-(--transform-origin) p-4 outline-hidden transition-[opacity,scale,translate] duration-150 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:-translate-y-2 data-starting-style:scale-95 data-starting-style:opacity-0",
        props.class
      )}
      {...others}
    />
  );
};

export { Popover, PopoverTrigger, PopoverContent };
