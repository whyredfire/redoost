import type { ComponentProps } from "@solidjs/web";
import { cn } from "cn";
import { omit } from "solid-js";

const Card = (props: ComponentProps<"div">) => {
  const others = omit(props, "class");

  return (
    <div
      data-slot="card"
      class={cn(
        "rounded-card bg-card text-card-foreground shadow-raised flex flex-col gap-6 py-6",
        props.class
      )}
      {...others}
    />
  );
};

const CardHeader = (props: ComponentProps<"div">) => {
  const others = omit(props, "class");

  return (
    <div
      data-slot="card-header"
      class={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        props.class
      )}
      {...others}
    />
  );
};

const CardTitle = (props: ComponentProps<"div">) => {
  const others = omit(props, "class");

  return (
    <div
      data-slot="card-title"
      class={cn("leading-none font-semibold", props.class)}
      {...others}
    />
  );
};

const CardDescription = (props: ComponentProps<"div">) => {
  const others = omit(props, "class");

  return (
    <div
      data-slot="card-description"
      class={cn("text-muted-foreground text-sm", props.class)}
      {...others}
    />
  );
};

const CardAction = (props: ComponentProps<"div">) => {
  const others = omit(props, "class");

  return (
    <div
      data-slot="card-action"
      class={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        props.class
      )}
      {...others}
    />
  );
};

const CardContent = (props: ComponentProps<"div">) => {
  const others = omit(props, "class");

  return (
    <div data-slot="card-content" class={cn("px-6", props.class)} {...others} />
  );
};

const CardFooter = (props: ComponentProps<"div">) => {
  const others = omit(props, "class");

  return (
    <div
      data-slot="card-footer"
      class={cn("flex items-center px-6 [.border-t]:pt-6", props.class)}
      {...others}
    />
  );
};

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
