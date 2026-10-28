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

type SiteSelectionProps = {
  // The sites listed right now, which select all picks
  shown: string[];
  selected: string[];
  onSelectAll: (all: boolean) => void;
  onCancel: () => void;
  onDelete: () => Promise<void>;
};

function sites(count: number) {
  return `${count} ${count === 1 ? "site" : "sites"}`;
}

// Picks sites from the list, then deletes them after a confirmation
export function SiteSelection({
  shown,
  selected,
  onSelectAll,
  onCancel,
  onDelete,
}: SiteSelectionProps) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const all = shown.length > 0 && selected.length === shown.length;

  function changeOpen(open: boolean) {
    if (deleting) return;
    setConfirming(open);
    setError("");
  }

  async function confirmDelete(event: MouseEvent) {
    // Keep the dialog open until every request finishes
    event.preventDefault();
    setDeleting(true);
    setError("");
    try {
      await onDelete();
      setConfirming(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setDeleting(false);
    }
  }

  return (
    // Stays under the header, so Delete is in reach however far the list scrolls
    <div className="sticky top-[calc(3.5rem+1px)] z-5 -mt-2 mb-2 bg-background py-2">
      <div className="flex items-center gap-3 rounded-xl border px-4 py-2 text-sm">
        <input
          type="checkbox"
          checked={all}
          // Some but not all, shown as a dash
          ref={(input) => {
            if (input) input.indeterminate = selected.length > 0 && !all;
          }}
          onChange={() => onSelectAll(!all)}
          aria-label="Select all shown sites"
          className="size-4 shrink-0 cursor-pointer accent-primary"
        />
        <span className="flex-1 text-muted-foreground">
          {selected.length > 0
            ? `${sites(selected.length)} selected`
            : "Select sites"}
        </span>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <AlertDialog open={confirming} onOpenChange={changeOpen}>
          <AlertDialogTrigger asChild>
            <Button
              variant="destructive"
              size="sm"
              disabled={selected.length === 0}
            >
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete {sites(selected.length)}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {selected.length === 1 ? "It" : "They"} will stop working and{" "}
                {selected.length === 1 ? "its" : "their"} files will be removed.
                This can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <ul className="max-h-40 overflow-y-auto rounded-lg border bg-muted/30 px-3 py-2 font-mono text-xs">
              {selected.map((slug) => (
                <li key={slug} className="truncate py-0.5">
                  {slug}
                </li>
              ))}
            </ul>
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
                {deleting ? "Deleting…" : `Delete ${sites(selected.length)}`}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
