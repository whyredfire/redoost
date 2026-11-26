import * as AlertDialogPrimitive from "@kobalte/core/alert-dialog";
import { useDialogContext } from "@kobalte/core/dialog";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import type { ComponentProps, ValidComponent } from "@solidjs/web";
import { omit } from "solid-js";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const AlertDialog = AlertDialogPrimitive.Root;

const AlertDialogTrigger = <T extends ValidComponent = "button">(
  props: PolymorphicProps<T, AlertDialogPrimitive.AlertDialogTriggerProps<T>>
) => (
  <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
);

const AlertDialogPortal = (
  props: AlertDialogPrimitive.AlertDialogPortalProps
) => <AlertDialogPrimitive.Portal {...props} />;

const AlertDialogOverlay = (
  props: PolymorphicProps<
    "div",
    AlertDialogPrimitive.AlertDialogOverlayProps<"div">
  >
) => {
  const others = omit(props, "class");

  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      class={cn(
        "data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:animate-in data-[expanded]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        props.class
      )}
      {...others}
    />
  );
};

const AlertDialogContent = (
  props: PolymorphicProps<
    "div",
    AlertDialogPrimitive.AlertDialogContentProps<"div">
  > & {
    size?: "default" | "sm";
  }
) => {
  const others = omit(props, "class", "size");

  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        data-size={props.size ?? "default"}
        class={cn(
          "group/alert-dialog-content rounded-card bg-card shadow-modal data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95 data-[expanded]:animate-in data-[expanded]:fade-in-0 data-[expanded]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 p-6 duration-200 data-[size=sm]:max-w-xs data-[size=default]:sm:max-w-lg",
          props.class
        )}
        onPointerDownOutside={(event) => event.preventDefault()}
        {...others}
      />
    </AlertDialogPortal>
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
  props: PolymorphicProps<
    "h2",
    AlertDialogPrimitive.AlertDialogTitleProps<"h2">
  >
) => {
  const others = omit(props, "class");

  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      class={cn(
        "text-lg font-semibold sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
        props.class
      )}
      {...others}
    />
  );
};

const AlertDialogDescription = (
  props: PolymorphicProps<
    "p",
    AlertDialogPrimitive.AlertDialogDescriptionProps<"p">
  >
) => {
  const others = omit(props, "class");

  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      class={cn("text-muted-foreground text-sm", props.class)}
      {...others}
    />
  );
};

const AlertDialogMedia = (props: ComponentProps<"div">) => {
  const others = omit(props, "class");

  return (
    <div
      data-slot="alert-dialog-media"
      class={cn(
        "bg-muted mb-2 inline-flex size-16 items-center justify-center rounded-md sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-8",
        props.class
      )}
      {...others}
    />
  );
};

type AlertDialogButtonProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  onClick?: (event: MouseEvent) => void;
};

const closingButton =
  (slot: string, variant: AlertDialogButtonProps["variant"]) =>
  (props: AlertDialogButtonProps) => {
    const dialog = useDialogContext();
    const others = omit(props, "variant", "size", "onClick");

    return (
      <Button
        data-slot={slot}
        variant={props.variant ?? variant}
        size={props.size ?? "default"}
        onClick={(event) => {
          props.onClick?.(event);

          if (!event.defaultPrevented) {
            dialog.close();
          }
        }}
        {...others}
      />
    );
  };

const AlertDialogAction = closingButton("alert-dialog-action", "default");
const AlertDialogCancel = closingButton("alert-dialog-cancel", "outline");

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
