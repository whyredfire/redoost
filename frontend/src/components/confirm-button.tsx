import { errorMessage } from "@redoost/shared";
import { Dynamic } from "@solidjs/web";
import type { JSX } from "@solidjs/web";
import { Show, createSignal, omit } from "solid-js";
import type { ComponentProps } from "solid-js";

import { Hint } from "@/components/hint";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

type ConfirmButtonProps = {
  label?: string;
  question: string;
  warning: string;
  action: string;
  pending?: string;
  details?: JSX.Element;
  onConfirm: () => Promise<void>;
  children: JSX.Element;
  as?: "button";
} & Omit<ComponentProps<typeof AlertDialogTrigger>, "children" | "onClick"> &
  Pick<ComponentProps<typeof Button>, "variant" | "size">;

export const ConfirmButton = (props: ConfirmButtonProps) => {
  const trigger = omit(
    props,
    "label",
    "question",
    "warning",
    "action",
    "pending",
    "details",
    "onConfirm",
    "children",
    "as"
  );

  const [confirming, setConfirming] = createSignal(false);
  const [working, setWorking] = createSignal(false);
  const [error, setError] = createSignal("");

  const changeOpen = (open: boolean) => {
    if (working()) {
      return;
    }

    setConfirming(open);
    setError("");
  };

  const confirm = async (event: MouseEvent) => {
    // WARNING: AlertDialogAction closes the dialog unless the click is default-prevented; it must stay open until the request finishes
    event.preventDefault();
    setWorking(true);
    setError("");

    try {
      await props.onConfirm();
      setConfirming(false);
    } catch (error_) {
      setError(errorMessage(error_));
    } finally {
      setWorking(false);
    }
  };

  const button = () => (
    <AlertDialogTrigger
      {...trigger}
      render={(part) => <Dynamic component={props.as ?? Button} {...part} />}
    >
      {props.children}
    </AlertDialogTrigger>
  );

  return (
    <AlertDialog open={confirming()} onOpenChange={changeOpen}>
      <Show when={props.label} fallback={button()}>
        {(label) => <Hint label={label()}>{button()}</Hint>}
      </Show>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.question}</AlertDialogTitle>
          <AlertDialogDescription>{props.warning}</AlertDialogDescription>
        </AlertDialogHeader>
        {props.details}
        <Show when={error()}>
          <p role="alert" class="text-destructive text-sm">
            {error()}
          </p>
        </Show>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={working()}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={working()}
            onClick={confirm}
          >
            {working() ? (props.pending ?? "Working…") : props.action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
