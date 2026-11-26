import * as DialogPrimitive from "@kobalte/core/dialog";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import type { ComponentProps, ValidComponent } from "@solidjs/web";
import { omit, Show } from "solid-js";

import { XIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = <T extends ValidComponent = "button">(
  props: PolymorphicProps<T, DialogPrimitive.DialogTriggerProps<T>>
) => <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;

const DialogPortal = (props: DialogPrimitive.DialogPortalProps) => (
  <DialogPrimitive.Portal {...props} />
);

const DialogClose = <T extends ValidComponent = "button">(
  props: PolymorphicProps<T, DialogPrimitive.DialogCloseButtonProps<T>>
) => <DialogPrimitive.CloseButton data-slot="dialog-close" {...props} />;

const DialogOverlay = (
  props: PolymorphicProps<"div", DialogPrimitive.DialogOverlayProps<"div">>
) => {
  const others = omit(props, "class");

  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      class={cn(
        "data-[closed]:animate-out data-[closed]:fade-out-0 data-[expanded]:animate-in data-[expanded]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        props.class
      )}
      {...others}
    />
  );
};

const DialogContent = (
  props: PolymorphicProps<"div", DialogPrimitive.DialogContentProps<"div">> & {
    showCloseButton?: boolean;
  }
) => {
  const others = omit(props, "class", "children", "showCloseButton");

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        class={cn(
          "rounded-card bg-card shadow-modal data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95 data-[expanded]:animate-in data-[expanded]:fade-in-0 data-[expanded]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 p-6 duration-200 outline-none sm:max-w-lg",
          props.class
        )}
        {...others}
      >
        {props.children}
        <Show when={props.showCloseButton ?? true}>
          <DialogPrimitive.CloseButton
            data-slot="dialog-close"
            aria-label="Close"
            class="ring-offset-background focus:ring-ring data-[expanded]:bg-accent data-[expanded]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span class="sr-only">Close</span>
          </DialogPrimitive.CloseButton>
        </Show>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
};

const DialogHeader = (props: ComponentProps<"div">) => {
  const others = omit(props, "class");

  return (
    <div
      data-slot="dialog-header"
      class={cn("flex flex-col gap-2 text-center sm:text-left", props.class)}
      {...others}
    />
  );
};

const DialogFooter = (
  props: ComponentProps<"div"> & {
    showCloseButton?: boolean;
  }
) => {
  const others = omit(props, "class", "children", "showCloseButton");

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
  );
};

const DialogTitle = (
  props: PolymorphicProps<"h2", DialogPrimitive.DialogTitleProps<"h2">>
) => {
  const others = omit(props, "class");

  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      class={cn("text-lg leading-none font-semibold", props.class)}
      {...others}
    />
  );
};

const DialogDescription = (
  props: PolymorphicProps<"p", DialogPrimitive.DialogDescriptionProps<"p">>
) => {
  const others = omit(props, "class");

  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      class={cn("text-muted-foreground text-sm", props.class)}
      {...others}
    />
  );
};

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
};
