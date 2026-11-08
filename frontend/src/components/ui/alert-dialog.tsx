import type { ComponentProps, ReactElement, ReactNode } from "react";
import { cn } from "cn";
import { Dialog } from "@cloudflare/kumo/components/dialog";
import { Button } from "@/components/ui/button";

function AlertDialog({
  open,
  onOpenChange,
  children,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Dialog.Root role="alertdialog" open={open} onOpenChange={onOpenChange}>
      {children}
    </Dialog.Root>
  );
}

function AlertDialogTrigger({
  asChild,
  children,
}: {
  asChild?: boolean;
  children: ReactNode;
}) {
  return asChild ? (
    <Dialog.Trigger render={children as ReactElement} />
  ) : (
    <Dialog.Trigger>{children}</Dialog.Trigger>
  );
}

function AlertDialogContent({ children }: { children: ReactNode }) {
  return <Dialog className="flex flex-col gap-4 p-6">{children}</Dialog>;
}

function AlertDialogHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-2", className)} {...props} />;
}

function AlertDialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function AlertDialogTitle({ className, ...props }: ComponentProps<"h2">) {
  return (
    <Dialog.Title
      className={cn("text-lg font-semibold", className)}
      {...props}
    />
  );
}

function AlertDialogDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <Dialog.Description
      className={cn("text-kumo-subtle", className)}
      {...props}
    />
  );
}

// Doesn't close by itself, so the dialog can stay up while its action runs
const AlertDialogAction = Button;

function AlertDialogCancel(props: ComponentProps<typeof Button>) {
  return <Dialog.Close render={<Button variant="outline" {...props} />} />;
}

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
