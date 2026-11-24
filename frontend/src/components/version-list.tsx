import { For, Show, createMemo, createSignal } from "solid-js";
import { History, Trash2 } from "@/components/icons";
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

export function VersionList(props: VersionListProps) {
  const [restoring, setRestoring] = createSignal<string | null>(null);
  const [error, setError] = createSignal("");
  const others = createMemo(
    () => props.versions.filter((version) => !version.current).length,
  );

  async function restore(id: string) {
    setRestoring(id);
    setError("");
    try {
      await props.onRestore(id);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setRestoring(null);
    }
  }

  return (
    <div class="space-y-3">
      <ul class="divide-y rounded-xl bg-card shadow-raised text-sm">
        <For each={props.versions} keyed={(version) => version.id}>
          {(version) => (
            <li class="flex items-center justify-between gap-4 px-4 py-2.5">
              <div class="min-w-0 space-y-1">
                <p class="flex items-center gap-2">
                  <span class="truncate">
                    {formatDate(version().created_at)} at{" "}
                    {formatTime(version().created_at)}
                  </span>
                  <Show when={version().current}>
                    <span class="shrink-0 rounded-md bg-brand/10 px-1.5 py-0.5 text-xs text-brand">
                      Current
                    </span>
                  </Show>
                </p>
                <SiteDescription
                  description={version().description}
                  onSave={(description: string) =>
                    props.onDescribe(version().id, description)
                  }
                  placeholder="What changed?"
                  compact
                />
                <p class="font-mono text-xs text-muted-foreground">
                  {version().id} · {version().file_count}{" "}
                  {version().file_count === 1 ? "file" : "files"} ·{" "}
                  {formatBytes(version().size)}
                </p>
              </div>
              <Show when={!version().current}>
                <div class="flex shrink-0 items-center gap-1">
                  <Hint label="Restore this version">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Restore this version"
                      disabled={props.busy || restoring() !== null}
                      onClick={() => restore(version().id)}
                    >
                      <History />
                    </Button>
                  </Hint>
                  <ConfirmButton
                    label="Delete this version"
                    question="Delete this version?"
                    warning="Its files are removed, and it can't be restored afterwards."
                    action="Delete version"
                    onConfirm={() => props.onDelete(version().id)}
                    variant="ghost"
                    size="icon"
                    aria-label="Delete this version"
                  >
                    <Trash2 />
                  </ConfirmButton>
                </div>
              </Show>
            </li>
          )}
        </For>
      </ul>
      <Show when={error()}>
        <p role="alert" class="text-sm text-destructive">
          {error()}
        </p>
      </Show>
      <Show when={others() > 0}>
        <div class="flex items-center justify-between gap-4 text-sm">
          <p class="text-muted-foreground">
            Restoring is instant, and keeps the version it replaces.
          </p>
          <ConfirmButton
            label="Delete every version but the current one"
            question="Delete the other versions?"
            warning={`The ${others() === 1 ? "other version is" : `${others()} other versions are`} removed, keeping only the one visitors see. This can't be undone.`}
            action="Delete other versions"
            onConfirm={() => props.onPrune()}
            variant="outline"
            size="sm"
            class="shrink-0"
          >
            Delete other versions
          </ConfirmButton>
        </div>
      </Show>
    </div>
  );
}
