import { History, Trash2 } from "lucide-react";
import { useState } from "react";
import { ConfirmButton } from "@/components/confirm-button";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/hint";
import { SiteDescription } from "@/components/site-description";
import type { Version } from "@/lib/deploy";
import {
  errorMessage,
  formatBytes,
  formatDate,
  formatTime,
} from "@/lib/format";

type VersionListProps = {
  versions: Version[];
  busy: boolean;
  onRestore: (id: string) => Promise<void>;
  onDescribe: (id: string, description: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onPrune: () => Promise<void>;
};

export function VersionList({
  versions,
  busy,
  onRestore,
  onDescribe,
  onDelete,
  onPrune,
}: VersionListProps) {
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error, setError] = useState("");
  const others = versions.filter((version) => !version.current).length;

  async function restore(id: string) {
    setRestoring(id);
    setError("");
    try {
      await onRestore(id);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y rounded-xl border text-sm">
        {versions.map((version) => (
          <li
            key={version.id}
            className="flex items-center justify-between gap-4 px-4 py-2.5"
          >
            <div className="min-w-0 space-y-1">
              <p className="flex items-center gap-2">
                <span className="truncate">
                  {formatDate(version.created_at)} at{" "}
                  {formatTime(version.created_at)}
                </span>
                {version.current && (
                  <span className="shrink-0 rounded-md bg-brand/10 px-1.5 py-0.5 text-xs text-brand">
                    Current
                  </span>
                )}
              </p>
              <SiteDescription
                description={version.description}
                onSave={(description) => onDescribe(version.id, description)}
                placeholder="What changed?"
                compact
              />
              <p className="font-mono text-xs text-muted-foreground">
                {version.id} · {version.file_count}{" "}
                {version.file_count === 1 ? "file" : "files"} ·{" "}
                {formatBytes(version.size)}
              </p>
            </div>
            {!version.current && (
              <div className="flex shrink-0 items-center gap-1">
                <Hint label="Restore this version">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Restore this version"
                    disabled={busy || restoring !== null}
                    onClick={() => restore(version.id)}
                  >
                    <History />
                  </Button>
                </Hint>
                <ConfirmButton
                  label="Delete this version"
                  question="Delete this version?"
                  warning="Its files are removed, and it can't be restored afterwards."
                  action="Delete version"
                  onConfirm={() => onDelete(version.id)}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete this version"
                  >
                    <Trash2 />
                  </Button>
                </ConfirmButton>
              </div>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {others > 0 && (
        <div className="flex items-center justify-between gap-4 text-sm">
          <p className="text-muted-foreground">
            Restoring is instant, and keeps the version it replaces.
          </p>
          <ConfirmButton
            label="Delete every version but the current one"
            question="Delete the other versions?"
            warning={`The ${others === 1 ? "other version is" : `${others} other versions are`} removed, keeping only the one visitors see. This can't be undone.`}
            action="Delete other versions"
            onConfirm={onPrune}
          >
            <Button variant="outline" size="sm" className="shrink-0">
              Delete other versions
            </Button>
          </ConfirmButton>
        </div>
      )}
    </div>
  );
}
