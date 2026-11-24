import { cn } from "cn"
import { omit } from "solid-js"
import type { ComponentProps } from "@solidjs/web"

function Card(props: ComponentProps<"div">) {
  const others = omit(props, "class")
  return (
    <div
      data-slot="card"
      class={cn(
        "flex flex-col gap-6 rounded-card bg-card py-6 text-card-foreground shadow-raised",
        props.class
      )}
      {...others}
    />
  )
}

function CardHeader(props: ComponentProps<"div">) {
  const others = omit(props, "class")
  return (
    <div
      data-slot="card-header"
      class={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        props.class
      )}
      {...others}
    />
  )
}

function CardTitle(props: ComponentProps<"div">) {
  const others = omit(props, "class")
  return (
    <div
      data-slot="card-title"
      class={cn("leading-none font-semibold", props.class)}
      {...others}
    />
  )
}

function CardDescription(props: ComponentProps<"div">) {
  const others = omit(props, "class")
  return (
    <div
      data-slot="card-description"
      class={cn("text-sm text-muted-foreground", props.class)}
      {...others}
    />
  )
}

function CardAction(props: ComponentProps<"div">) {
  const others = omit(props, "class")
  return (
    <div
      data-slot="card-action"
      class={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        props.class
      )}
      {...others}
    />
  )
}

function CardContent(props: ComponentProps<"div">) {
  const others = omit(props, "class")
  return (
    <div
      data-slot="card-content"
      class={cn("px-6", props.class)}
      {...others}
    />
  )
}

function CardFooter(props: ComponentProps<"div">) {
  const others = omit(props, "class")
  return (
    <div
      data-slot="card-footer"
      class={cn("flex items-center px-6 [.border-t]:pt-6", props.class)}
      {...others}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}