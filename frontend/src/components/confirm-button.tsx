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

// Wraps a button, asking before its destructive action runs
export function ConfirmButton({
  label,
  question,
  warning,
  action,
  onConfirm,
  children,
}: {
  // A tooltip, for buttons that are only an icon
  label?: string;
  question: string;
  warning: string;
  action: string;
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
    // Keep the dialog open until the request finishes
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

  return (
    <AlertDialog open={confirming} onOpenChange={changeOpen}>
      {label ? (
        <Hint label={label}>
          <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
        </Hint>
      ) : (
        <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{question}</AlertDialogTitle>
          <AlertDialogDescription>{warning}</AlertDialogDescription>
        </AlertDialogHeader>
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
            {working ? "Working…" : action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
