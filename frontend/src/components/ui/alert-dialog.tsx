import { cn } from "cn"
import * as AlertDialogPrimitive from "@kobalte/core/alert-dialog"
import { useDialogContext } from "@kobalte/core/dialog"
import type { PolymorphicProps } from "@kobalte/core/polymorphic"
import { omit } from "solid-js"
import type { ComponentProps, ValidComponent } from "@solidjs/web"

import { Button } from "@/components/ui/button"

const AlertDialog = AlertDialogPrimitive.Root

function AlertDialogTrigger<T extends ValidComponent = "button">(
  props: PolymorphicProps<T, AlertDialogPrimitive.AlertDialogTriggerProps<T>>
) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  )
}

function AlertDialogPortal(props: AlertDialogPrimitive.AlertDialogPortalProps) {
  return <AlertDialogPrimitive.Portal {...props} />
}

function AlertDialogOverlay(
  props: PolymorphicProps<
    "div",
    AlertDialogPrimitive.AlertDialogOverlayProps<"div">
  >
) {
  const others = omit(props, "class")
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      class={cn(
        "fixed inset-0 z-50 bg-black/50 data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:animate-in data-[expanded]:fade-in-0",
        props.class
      )}
      {...others}
    />
  )
}

function AlertDialogContent(
  props: PolymorphicProps<
    "div",
    AlertDialogPrimitive.AlertDialogContentProps<"div">
  > & {
    size?: "default" | "sm"
  }
) {
  const others = omit(props, "class", "size")
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        data-size={props.size ?? "default"}
        class={cn(
          "group/alert-dialog-content fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-card bg-card p-6 shadow-modal duration-200 data-[size=sm]:max-w-xs data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95 data-[expanded]:animate-in data-[expanded]:fade-in-0 data-[expanded]:zoom-in-95 data-[size=default]:sm:max-w-lg",
          props.class
        )}
        // An alert dialog isn't dismissed by clicking outside it, as with Radix
        onPointerDownOutside={(event) => event.preventDefault()}
        {...others}
      />
    </AlertDialogPortal>
  )
}

function AlertDialogHeader(props: ComponentProps<"div">) {
  const others = omit(props, "class")
  return (
    <div
      data-slot="alert-dialog-header"
      class={cn(
        "grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-6 sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]",
        props.class
      )}
      {...others}
    />
  )
}

function AlertDialogFooter(props: ComponentProps<"div">) {
  const others = omit(props, "class")
  return (
    <div
      data-slot="alert-dialog-footer"
      class={cn(
        "flex flex-col-reverse gap-2 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end",
        props.class
      )}
      {...others}
    />
  )
}

function AlertDialogTitle(
  props: PolymorphicProps<"h2", AlertDialogPrimitive.AlertDialogTitleProps<"h2">>
) {
  const others = omit(props, "class")
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      class={cn(
        "text-lg font-semibold sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
        props.class
      )}
      {...others}
    />
  )
}

function AlertDialogDescription(
  props: PolymorphicProps<
    "p",
    AlertDialogPrimitive.AlertDialogDescriptionProps<"p">
  >
) {
  const others = omit(props, "class")
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      class={cn("text-sm text-muted-foreground", props.class)}
      {...others}
    />
  )
}

function AlertDialogMedia(props: ComponentProps<"div">) {
  const others = omit(props, "class")
  return (
    <div
      data-slot="alert-dialog-media"
      class={cn(
        "mb-2 inline-flex size-16 items-center justify-center rounded-md bg-muted sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-8",
        props.class
      )}
      {...others}
    />
  )
}

type AlertDialogButtonProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  onClick?: (event: MouseEvent) => void
}

// Kobalte has no Action/Cancel parts: like Radix's, they close the dialog unless the click is default-prevented
function closingButton(slot: string, variant: AlertDialogButtonProps["variant"]) {
  return (props: AlertDialogButtonProps) => {
    const dialog = useDialogContext()
    const others = omit(props, "variant", "size", "onClick")
    return (
      <Button
        data-slot={slot}
        variant={props.variant ?? variant}
        size={props.size ?? "default"}
        onClick={(event) => {
          props.onClick?.(event)
          if (!event.defaultPrevented) dialog.close()
        }}
        {...others}
      />
    )
  }
}

const AlertDialogAction = closingButton("alert-dialog-action", "default")
const AlertDialogCancel = closingButton("alert-dialog-cancel", "outline")

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
}
