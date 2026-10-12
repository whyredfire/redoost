import { useState, type MouseEvent } from "react";
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

type DangerActionProps = {
  title: string;
  description: string;
  question: string;
  warning: string;
  action: string;
  onConfirm: () => Promise<void>;
};

// A destructive action, confirmed in a dialog before it runs
export function DangerAction({
  title,
  description,
  question,
  warning,
  action,
  onConfirm,
}: DangerActionProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  function changeOpen(open: boolean) {
    if (deleting) return;
    setConfirming(open);
    setError("");
  }

  async function confirmDelete(event: MouseEvent) {
    // Keep the dialog open until the request finishes
    event.preventDefault();
    setDeleting(true);
    setError("");
    try {
      await onConfirm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setDeleting(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/30 px-4 py-3 text-sm">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <AlertDialog open={confirming} onOpenChange={changeOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="sm" className="shrink-0">
            Delete
          </Button>
        </AlertDialogTrigger>
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
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={confirmDelete}
            >
              {deleting ? "Deleting…" : action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
