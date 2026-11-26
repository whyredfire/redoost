import type { ComponentProps } from "@solidjs/web";
import * as DialogPrimitive from "@ui-sdk/solid/dialog";
import { omit, Show } from "solid-js";

import { XIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const { Dialog } = DialogPrimitive;

const { DialogTrigger } = DialogPrimitive;

const DialogContent = (
  props: ComponentProps<typeof DialogPrimitive.DialogContent> & {
    class?: string;
    showCloseButton?: boolean;
  }
) => {
  const others = omit(props, "class", "children", "showCloseButton");

  return (
    <>
      <DialogPrimitive.DialogBackdrop class="fixed inset-0 z-50 bg-black/50 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <DialogPrimitive.DialogContent
        class={cn(
          "rounded-card bg-card shadow-modal fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 p-6 transition-[opacity,scale] duration-200 outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 sm:max-w-lg",
          props.class
        )}
        {...others}
      >
        {props.children}
        <Show when={props.showCloseButton ?? true}>
          <DialogPrimitive.DialogClose
            aria-label="Close"
            class="ring-offset-background focus:ring-ring absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          >
            <XIcon />
            <span class="sr-only">Close</span>
          </DialogPrimitive.DialogClose>
        </Show>
      </DialogPrimitive.DialogContent>
    </>
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
        <DialogPrimitive.DialogClose
          aria-label="Close"
          render={(close) => <Button {...close} variant="outline" />}
        >
          Close
        </DialogPrimitive.DialogClose>
      </Show>
    </div>
  );
};

const DialogTitle = (
  props: ComponentProps<typeof DialogPrimitive.DialogTitle> & { class?: string }
) => {
  const others = omit(props, "class");

  return (
    <DialogPrimitive.DialogTitle
      class={cn("text-lg leading-none font-semibold", props.class)}
      {...others}
    />
  );
};

const DialogDescription = (
  props: ComponentProps<typeof DialogPrimitive.DialogDescription> & {
    class?: string;
  }
) => {
  const others = omit(props, "class");

  return (
    <DialogPrimitive.DialogDescription
      class={cn("text-muted-foreground text-sm", props.class)}
      {...others}
    />
  );
};

export {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
};
