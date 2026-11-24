import { cn } from "cn"
import * as AvatarPrimitive from "@kobalte/core/image"
import type { PolymorphicProps } from "@kobalte/core/polymorphic"
import { omit } from "solid-js"
import type { ComponentProps } from "@solidjs/web"

function Avatar(
  props: PolymorphicProps<"span", AvatarPrimitive.ImageRootProps<"span">> & {
    size?: "default" | "sm" | "lg"
  }
) {
  const others = omit(props, "class", "size")
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={props.size ?? "default"}
      class={cn(
        "group/avatar relative flex size-8 shrink-0 overflow-hidden rounded-full select-none data-[size=lg]:size-10 data-[size=sm]:size-6",
        props.class
      )}
      {...others}
    />
  )
}

function AvatarImage(
  props: PolymorphicProps<"img", AvatarPrimitive.ImageImgProps<"img">>
) {
  const others = omit(props, "class")
  return (
    <AvatarPrimitive.Img
      data-slot="avatar-image"
      class={cn("aspect-square size-full", props.class)}
      // Kobalte preloads the image with the camelCase prop, so pass it on for that request too
      {...({ referrerPolicy: props.referrerpolicy } as {})}
      {...others}
    />
  )
}

function AvatarFallback(
  props: PolymorphicProps<"span", AvatarPrimitive.ImageFallbackProps<"span">>
) {
  const others = omit(props, "class")
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      class={cn(
        "flex size-full items-center justify-center rounded-full bg-muted text-sm text-muted-foreground group-data-[size=sm]/avatar:text-xs",
        props.class
      )}
      {...others}
    />
  )
}

function AvatarBadge(props: ComponentProps<"span">) {
  const others = omit(props, "class")
  return (
    <span
      data-slot="avatar-badge"
      class={cn(
        "absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background select-none",
        "group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden",
        "group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2",
        "group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2",
        props.class
      )}
      {...others}
    />
  )
}

function AvatarGroup(props: ComponentProps<"div">) {
  const others = omit(props, "class")
  return (
    <div
      data-slot="avatar-group"
      class={cn(
        "group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background",
        props.class
      )}
      {...others}
    />
  )
}

function AvatarGroupCount(props: ComponentProps<"div">) {
  const others = omit(props, "class")
  return (
    <div
      data-slot="avatar-group-count"
      class={cn(
        "relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm text-muted-foreground ring-2 ring-background group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3",
        props.class
      )}
      {...others}
    />
  )
}

export {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarBadge,
  AvatarGroup,
  AvatarGroupCount,
}
