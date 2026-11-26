import type { ComponentProps } from "@solidjs/web";
import * as AvatarPrimitive from "@ui-sdk/solid/avatar";
import { omit } from "solid-js";

import { cn } from "@/lib/cn";

const Avatar = (
  props: ComponentProps<typeof AvatarPrimitive.Avatar> & {
    class?: string;
    size?: "default" | "sm" | "lg";
  }
) => {
  const others = omit(props, "class", "size");

  return (
    <AvatarPrimitive.Avatar
      data-size={props.size ?? "default"}
      class={cn(
        "group/avatar relative flex size-8 shrink-0 overflow-hidden rounded-full select-none data-[size=lg]:size-10 data-[size=sm]:size-6",
        props.class
      )}
      {...others}
    />
  );
};

const AvatarImage = (
  props: ComponentProps<typeof AvatarPrimitive.AvatarImage> & {
    class?: string;
  }
) => {
  const others = omit(props, "class");

  return (
    <AvatarPrimitive.AvatarImage
      class={cn("aspect-square size-full", props.class)}
      {...others}
    />
  );
};

const AvatarFallback = (
  props: ComponentProps<typeof AvatarPrimitive.AvatarFallback> & {
    class?: string;
  }
) => {
  const others = omit(props, "class");

  return (
    <AvatarPrimitive.AvatarFallback
      class={cn(
        "bg-muted text-muted-foreground flex size-full items-center justify-center rounded-full text-sm group-data-[size=sm]/avatar:text-xs",
        props.class
      )}
      {...others}
    />
  );
};

export { Avatar, AvatarImage, AvatarFallback };
