import type { ComponentProps } from "@solidjs/web";
import * as AlertDialogPrimitive from "@ui-sdk/solid/alert-dialog";
import { omit } from "solid-js";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const { AlertDialog } = AlertDialogPrimitive;

const { AlertDialogTrigger } = AlertDialogPrimitive;

const AlertDialogContent = (
  props: ComponentProps<typeof AlertDialogPrimitive.AlertDialogContent> & {
    class?: string;
    size?: "default" | "sm";
  }
) => {
  const others = omit(props, "class", "size");

  return (
    <>
      <AlertDialogPrimitive.AlertDialogBackdrop class="fixed inset-0 z-50 bg-black/50 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <AlertDialogPrimitive.AlertDialogContent
        data-size={props.size ?? "default"}
        class={cn(
          "group/alert-dialog-content rounded-card bg-card shadow-modal fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 p-6 transition-[opacity,scale] duration-200 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-lg",
          props.class
        )}
        {...others}
      />
    </>
  );
};

const AlertDialogHeader = (props: ComponentProps<"div">) => {
  const others = omit(props, "class");

  return (
    <div
      data-slot="alert-dialog-header"
      class={cn(
        "grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-6 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]",
        props.class
      )}
      {...others}
    />
  );
};

const AlertDialogFooter = (props: ComponentProps<"div">) => {
  const others = omit(props, "class");

  return (
    <div
      data-slot="alert-dialog-footer"
      class={cn(
        "flex flex-col-reverse gap-2 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end",
        props.class
      )}
      {...others}
    />
  );
};

const AlertDialogTitle = (
  props: ComponentProps<typeof AlertDialogPrimitive.AlertDialogTitle> & {
    class?: string;
  }
) => {
  const others = omit(props, "class");

  return (
    <AlertDialogPrimitive.AlertDialogTitle
      class={cn(
        "text-lg font-semibold sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
        props.class
      )}
      {...others}
    />
  );
};

const AlertDialogDescription = (
  props: ComponentProps<typeof AlertDialogPrimitive.AlertDialogDescription> & {
    class?: string;
  }
) => {
  const others = omit(props, "class");

  return (
    <AlertDialogPrimitive.AlertDialogDescription
      class={cn("text-muted-foreground text-sm", props.class)}
      {...others}
    />
  );
};

type AlertDialogButtonProps = ComponentProps<
  typeof AlertDialogPrimitive.AlertDialogClose
> &
  Pick<ComponentProps<typeof Button>, "variant" | "size">;

const closingButton =
  (variant: AlertDialogButtonProps["variant"]) =>
  (props: AlertDialogButtonProps) => {
    const others = omit(props, "variant", "size");

    return (
      <AlertDialogPrimitive.AlertDialogClose
        {...others}
        render={(close) => (
          <Button
            {...close}
            variant={props.variant ?? variant}
            size={props.size ?? "default"}
          />
        )}
      />
    );
  };

const AlertDialogAction = closingButton("default");
const AlertDialogCancel = closingButton("outline");

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
};
