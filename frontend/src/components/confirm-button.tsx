import type { JSX } from "@solidjs/web";
import { Show, createSignal, omit, type ComponentProps } from "solid-js";
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
import { Hint } from "@/components/hint";
import { errorMessage } from "@/lib/format";

// Props beyond these go to the trigger, a Button unless `as` says otherwise
type ConfirmButtonProps = {
  label?: string;
  question: string;
  warning: string;
  action: string;
  pending?: string;
  details?: JSX.Element;
  onConfirm: () => Promise<void>;
  children: JSX.Element;
  as?: ComponentProps<typeof AlertDialogTrigger>["as"];
} & Omit<ComponentProps<typeof Button>, "children" | "onClick">;

export function ConfirmButton(props: ConfirmButtonProps) {
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
    "as",
  );
  const [confirming, setConfirming] = createSignal(false);
  const [working, setWorking] = createSignal(false);
  const [error, setError] = createSignal("");

  function changeOpen(open: boolean) {
    if (working()) return;
    setConfirming(open);
    setError("");
  }

  async function confirm(event: MouseEvent) {
    // Radix closes the dialog on click; it stays open until the request finishes
    event.preventDefault();
    setWorking(true);
    setError("");
    try {
      await props.onConfirm();
      setConfirming(false);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setWorking(false);
    }
  }

  const button = () => (
    // The trigger props are Button's or the `as` element's, which TypeScript can't relate
    <AlertDialogTrigger as={props.as ?? Button} {...(trigger as Record<string, unknown>)}>
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
          <p role="alert" class="text-sm text-destructive">
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
}
