import { useState, type MouseEvent, type ReactNode } from "react";
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
import { Hint } from "@/components/hint";
import { errorMessage } from "@/lib/format";

export function ConfirmButton({
  label,
  question,
  warning,
  action,
  pending = "Working…",
  details,
  onConfirm,
  children,
}: {
  label?: string;
  question: string;
  warning: string;
  action: string;
  pending?: string;
  details?: ReactNode;
  onConfirm: () => Promise<void>;
  children: ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  function changeOpen(open: boolean) {
    if (working) return;
    setConfirming(open);
    setError("");
  }

  async function confirm(event: MouseEvent) {
    // Radix closes the dialog on click; it stays open until the request finishes
    event.preventDefault();
    setWorking(true);
    setError("");
    try {
      await onConfirm();
      setConfirming(false);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setWorking(false);
    }
  }

  const trigger = <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>;

  return (
    <AlertDialog open={confirming} onOpenChange={changeOpen}>
      {label ? <Hint label={label}>{trigger}</Hint> : trigger}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{question}</AlertDialogTitle>
          <AlertDialogDescription>{warning}</AlertDialogDescription>
        </AlertDialogHeader>
        {details}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={working}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={working}
            onClick={confirm}
          >
            {working ? pending : action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
