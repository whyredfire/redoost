import { ExternalLink, Trash2 } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Deployment } from "@/lib/deploy";
import { formatBytes, siteUrl } from "@/lib/format";

type SiteListProps = {
  sites: Deployment[];
  onDelete: (slug: string) => Promise<void>;
};

export function SiteList({ sites, onDelete }: SiteListProps) {
  const [target, setTarget] = useState<Deployment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  function closeDialog(open: boolean) {
    if (open || deleting) return;
    setTarget(null);
    setError("");
  }

  async function confirmDelete(event: MouseEvent) {
    // Keep the dialog open until the request finishes
    event.preventDefault();
    if (!target) return;
    setDeleting(true);
    setError("");
    try {
      await onDelete(target.slug);
      setTarget(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card className="py-0">
      <ul className="divide-y">
        {sites.map((site) => {
          const url = siteUrl(site.slug);
          return (
            <li className="flex items-center gap-4 px-5 py-4" key={site.slug}>
              <div className="min-w-0 flex-1 md:flex md:items-center md:justify-between md:gap-6">
                <p className="truncate font-medium">{site.slug}</p>
                <p className="mt-0.5 shrink-0 text-sm text-muted-foreground md:mt-0">
                  {site.file_count} {site.file_count === 1 ? "file" : "files"} ·{" "}
                  {formatBytes(site.total_size)} ·{" "}
                  {new Date(site.created_at).toLocaleDateString(undefined, {
                    dateStyle: "medium",
                  })}
                </p>
              </div>
              <div className="flex shrink-0 items-center">
                {url && (
                  <>
                    <CopyButton
                      text={url}
                      label={`Copy ${site.slug} address`}
                    />
                    <Button variant="ghost" size="icon" asChild>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open ${site.slug}`}
                      >
                        <ExternalLink />
                      </a>
                    </Button>
                  </>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${site.slug}`}
                  onClick={() => setTarget(site)}
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <AlertDialog open={target !== null} onOpenChange={closeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this site?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">
                {target && (siteUrl(target.slug) ?? target.slug)}
              </span>{" "}
              will stop working and its files will be removed. This can't be
              undone.
            </AlertDialogDescription>
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
              {deleting ? "Deleting…" : "Delete site"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
