import { ExternalLink, FolderUp, Trash2 } from "lucide-react";
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
import { Hint } from "@/components/hint";
import { LiveDot } from "@/components/live-dot";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { Deployment } from "@/lib/deploy";
import { formatBytes, formatDate, siteUrl } from "@/lib/format";

type SiteListProps = {
  sites: Deployment[];
  // Off while an upload runs, which starting an update would lose
  canUpdate: boolean;
  onUpdate: (slug: string) => void;
  onToggle: (slug: string, enabled: boolean) => Promise<void>;
  onDelete: (slug: string) => Promise<void>;
};

export function SiteList({
  sites,
  canUpdate,
  onUpdate,
  onToggle,
  onDelete,
}: SiteListProps) {
  const [target, setTarget] = useState<Deployment | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState("");

  async function toggle(slug: string, enabled: boolean) {
    setSwitching(slug);
    setToggleError("");
    try {
      await onToggle(slug, enabled);
    } catch (cause) {
      setToggleError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSwitching(null);
    }
  }
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
            <li
              className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:gap-4"
              key={site.slug}
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2.5 font-mono text-sm font-medium">
                  <LiveDot off={!site.enabled} />
                  <span className="truncate">{site.slug}</span>
                </p>
                <p className="mt-1 pl-4.5 font-mono text-xs text-muted-foreground">
                  {site.file_count} {site.file_count === 1 ? "file" : "files"} ·{" "}
                  {formatBytes(site.total_size)} · {formatDate(site.created_at)}
                  {!site.enabled && " · offline"}
                </p>
              </div>
              <div className="-ml-2 flex shrink-0 items-center pl-4.5 sm:ml-0 sm:pl-0">
                <Hint
                  label={
                    site.enabled
                      ? "Take offline; visitors may see it for a minute"
                      : "Put online"
                  }
                >
                  <Switch
                    checked={site.enabled}
                    disabled={switching === site.slug}
                    onCheckedChange={(enabled) => toggle(site.slug, enabled)}
                    aria-label={`${site.slug} is online`}
                    className="mx-2.5"
                  />
                </Hint>
                <Hint
                  label={
                    canUpdate
                      ? "Replace its files with a new version"
                      : "Wait for the current upload to finish"
                  }
                >
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mr-1"
                    aria-label={`Update ${site.slug}`}
                    disabled={!canUpdate}
                    onClick={() => onUpdate(site.slug)}
                  >
                    <FolderUp />
                    Update
                  </Button>
                </Hint>
                {url && (
                  <>
                    <CopyButton
                      text={url}
                      label={`Copy ${site.slug} address`}
                    />
                    <Hint label="Open site">
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
                    </Hint>
                  </>
                )}
                <Hint label="Delete site">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${site.slug}`}
                    onClick={() => setTarget(site)}
                  >
                    <Trash2 />
                  </Button>
                </Hint>
              </div>
            </li>
          );
        })}
      </ul>
      {toggleError && (
        <p role="alert" className="border-t px-5 py-3 text-sm text-destructive">
          {toggleError}
        </p>
      )}

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
