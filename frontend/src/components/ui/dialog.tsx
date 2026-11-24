import { cn } from "cn"
import * as DialogPrimitive from "@kobalte/core/dialog"
import type { PolymorphicProps } from "@kobalte/core/polymorphic"
import { omit, Show } from "solid-js"
import type { ComponentProps, JSX, ValidComponent } from "@solidjs/web"

import { XIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"

const Dialog = DialogPrimitive.Root

function DialogTrigger<T extends ValidComponent = "button">(
  props: PolymorphicProps<T, DialogPrimitive.DialogTriggerProps<T>>
) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal(props: DialogPrimitive.DialogPortalProps) {
  return <DialogPrimitive.Portal {...props} />
}

function DialogClose<T extends ValidComponent = "button">(
  props: PolymorphicProps<T, DialogPrimitive.DialogCloseButtonProps<T>>
) {
  return <DialogPrimitive.CloseButton data-slot="dialog-close" {...props} />
}

function DialogOverlay(
  props: PolymorphicProps<"div", DialogPrimitive.DialogOverlayProps<"div">>
) {
  const others = omit(props, "class")
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      class={cn(
        "fixed inset-0 z-50 bg-black/50 data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:animate-in data-[expanded]:fade-in-0",
        props.class
      )}
      {...others}
    />
  )
}

function DialogContent(
  props: PolymorphicProps<"div", DialogPrimitive.DialogContentProps<"div">> & {
    showCloseButton?: boolean
  }
) {
  const others = omit(props, "class", "children", "showCloseButton")
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        class={cn(
          "fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-card bg-card p-6 shadow-modal duration-200 outline-none data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95 data-[expanded]:animate-in data-[expanded]:fade-in-0 data-[expanded]:zoom-in-95 sm:max-w-lg",
          props.class
        )}
        {...others}
      >
        {props.children}
        <Show when={props.showCloseButton ?? true}>
          <DialogPrimitive.CloseButton
            data-slot="dialog-close"
            aria-label="Close"
            class="absolute top-4 right-4 rounded-xs opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none data-[expanded]:bg-accent data-[expanded]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span class="sr-only">Close</span>
          </DialogPrimitive.CloseButton>
        </Show>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader(props: ComponentProps<"div">) {
  const others = omit(props, "class")
  return (
    <div
      data-slot="dialog-header"
      class={cn("flex flex-col gap-2 text-center sm:text-left", props.class)}
      {...others}
    />
  )
}

function DialogFooter(
  props: ComponentProps<"div"> & {
    showCloseButton?: boolean
  }
) {
  const others = omit(props, "class", "children", "showCloseButton")
  return (
    <div
      data-slot="dialog-footer"
      class={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        props.class
      )}
      {...others}
    >
      {props.children}
      <Show when={props.showCloseButton}>
        <DialogPrimitive.CloseButton
          as={Button}
          variant="outline"
          aria-label="Close"
        >
          Close
        </DialogPrimitive.CloseButton>
      </Show>
    </div>
  )
}

function DialogTitle(
  props: PolymorphicProps<"h2", DialogPrimitive.DialogTitleProps<"h2">>
) {
  const others = omit(props, "class")
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      class={cn("text-lg leading-none font-semibold", props.class)}
      {...others}
    />
  )
}

function DialogDescription(
  props: PolymorphicProps<"p", DialogPrimitive.DialogDescriptionProps<"p">>
) {
  const others = omit(props, "class")
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      class={cn("text-sm text-muted-foreground", props.class)}
      {...others}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
