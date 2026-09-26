import { CircleCheck, ExternalLink, FolderOpen } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { CopyButton } from "@/components/copy-button";
import { FolderDrop } from "@/components/folder-drop";
import { SitePreview } from "@/components/site-preview";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  completeDeployment,
  createDeployment,
  readLimits,
  uploadFiles,
  type Limits,
  type ManifestFile,
  type UploadSession,
} from "@/lib/deploy";
import { formatBytes, siteUrl } from "@/lib/format";
import {
  clearSession,
  loadSession,
  loadToken,
  saveSession,
  saveToken,
} from "@/lib/session";
import {
  droppedFiles,
  fileManifest,
  limitError,
  type SiteFile,
} from "@/lib/site-files";

type Stage =
  | "idle"
  | "hashing"
  | "creating"
  | "uploading"
  | "completing"
  | "ready"
  | "error";

const statusText: Partial<Record<Stage, string>> = {
  hashing: "Checking files…",
  creating: "Preparing upload…",
  completing: "Publishing site…",
};

function sameManifest(a: ManifestFile[], b: ManifestFile[]) {
  return (
    a.length === b.length &&
    a.every(
      (file, i) =>
        file.path === b[i]?.path &&
        file.size === b[i]?.size &&
        file.sha256 === b[i]?.sha256,
    )
  );
}

function Working({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <ThinkingOrb state="working" size={20} />
      {children}
    </span>
  );
}

type PublishCardProps = {
  onPublished: () => void;
  onEmptyChange: (empty: boolean) => void;
};

export function PublishCard({ onPublished, onEmptyChange }: PublishCardProps) {
  const [files, setFiles] = useState<SiteFile[]>([]);
  const [session, setSession] = useState<UploadSession | null>(loadSession);
  const [stage, setStage] = useState<Stage>(
    session?.deployment.state === "ready" ? "ready" : "idle",
  );
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [uploaded, setUploaded] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [limits, setLimits] = useState<Limits | null>(null);
  const controller = useRef<AbortController | null>(null);

  const busy = ["hashing", "creating", "uploading", "completing"].includes(
    stage,
  );
  const totalSize = files.reduce((sum, { file }) => sum + file.size, 0);
  const loaded = Object.values(progress).reduce((sum, bytes) => sum + bytes, 0);
  const percentage = totalSize ? Math.round((loaded / totalSize) * 100) : 0;

  useEffect(() => {
    // Without limits, the API still rejects oversized sites when publishing
    readLimits()
      .then(setLimits)
      .catch(() => {});
  }, []);

  function selectFiles(selected: SiteFile[]) {
    if (!selected.length) {
      setMessage("This folder has no files.");
      return;
    }
    const error = limits && limitError(selected, limits);
    if (error) {
      setMessage(error);
      return;
    }
    setFiles(selected);
    setMessage("");
    setStage("idle");
  }

  function startOver() {
    controller.current?.abort();
    clearSession();
    setSession(null);
    setFiles([]);
    setMessage("");
    setStage("idle");
  }

  async function publish() {
    const abort = new AbortController();
    controller.current = abort;
    setMessage("");
    setStage("hashing");

    try {
      const manifest = await fileManifest(files);
      abort.signal.throwIfAborted();

      let active = session;
      if (!active) {
        setStage("creating");
        const deployment = await createDeployment(
          manifest,
          loadToken(),
          abort.signal,
        );
        active = { deployment, manifest };
        saveToken(active.deployment.token);
        saveSession(active);
        setSession(active);
      } else if (Date.now() >= Date.parse(active.deployment.expires_at)) {
        throw new Error("The upload window has closed. Start over.");
      } else if (!sameManifest(manifest, active.manifest)) {
        throw new Error("Select the same folder to resume, or start over.");
      }

      setProgress({});
      setUploaded(0);
      setStage("uploading");
      await uploadFiles(
        active.deployment,
        files,
        abort.signal,
        (path, bytes, done) => {
          setProgress((current) => ({ ...current, [path]: bytes }));
          if (done) setUploaded((count) => count + 1);
        },
      );

      setStage("completing");
      const result = await completeDeployment(active.deployment, abort.signal);
      const finished = {
        ...active,
        deployment: { ...active.deployment, state: result.state },
      };
      saveSession(finished);
      setSession(finished);
      setStage("ready");
      onPublished();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setMessage("Upload cancelled.");
      } else {
        setMessage(error instanceof Error ? error.message : String(error));
      }
      setStage("error");
    } finally {
      controller.current = null;
    }
  }

  const acceptsDrop = !busy && stage !== "ready";
  const live = stage === "ready" && session !== null;
  const empty = files.length === 0 && !live;

  useEffect(() => {
    onEmptyChange(empty);
  }, [empty, onEmptyChange]);

  // The whole page is the drop target, so a stray drop never opens the file
  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent) =>
      event.dataTransfer?.types.includes("Files") ?? false;

    function enter(event: DragEvent) {
      if (!hasFiles(event)) return;
      depth += 1;
      setDragging(acceptsDrop);
    }
    function over(event: DragEvent) {
      if (hasFiles(event)) event.preventDefault();
    }
    function leave(event: DragEvent) {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    }
    async function drop(event: DragEvent) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      const items = event.dataTransfer?.items;
      if (!acceptsDrop || !items) return;
      try {
        const selected = await droppedFiles(items);
        selectFiles(selected);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
      }
    }

    addEventListener("dragenter", enter);
    addEventListener("dragover", over);
    addEventListener("dragleave", leave);
    addEventListener("drop", drop);
    return () => {
      removeEventListener("dragenter", enter);
      removeEventListener("dragover", over);
      removeEventListener("dragleave", leave);
      removeEventListener("drop", drop);
    };
  }, [acceptsDrop, limits]);

  if (stage === "ready" && session) {
    const url = siteUrl(session.deployment.slug);
    return (
      <Card className="min-h-(--publish-height) justify-center duration-300 motion-safe:transition-[min-height]">
        <CardContent className="mx-auto w-full max-w-xl space-y-6 text-center duration-300 motion-safe:animate-in motion-safe:fade-in">
          {url && <SitePreview url={url} />}
          <div>
            <p className="flex items-center justify-center gap-2 text-xl font-semibold">
              <CircleCheck className="size-5 text-emerald-600 dark:text-emerald-500" />
              Your site is live
            </p>
            <p className="mt-1 text-muted-foreground">
              Share this address with anyone.
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-xl border bg-muted/40 py-1 pr-1 pl-4 text-left">
            <span className="min-w-0 flex-1 truncate font-mono text-sm">
              {url ?? session.deployment.slug}
            </span>
            {url && (
              <>
                <CopyButton text={url} label="Copy address" />
                <Button variant="ghost" size="icon" asChild>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open site"
                  >
                    <ExternalLink />
                  </a>
                </Button>
              </>
            )}
          </div>
          <Button type="button" variant="outline" onClick={startOver}>
            Publish another site
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={`min-h-(--publish-height) transition-colors duration-300 motion-safe:transition-[min-height,color,background-color,border-color,box-shadow] ${files.length === 0 ? "border-0 bg-transparent py-0 shadow-none" : dragging ? "border-primary" : ""}`}
    >
      {/* Empty, the dashed drop area is the only frame */}
      <CardContent
        className={`flex flex-1 flex-col gap-5 ${files.length === 0 ? "px-0" : ""}`}
      >
        {session && files.length === 0 && (
          <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm">
            Select the same files to resume{" "}
            <span className="font-medium">{session.deployment.slug}</span>, or{" "}
            <button
              type="button"
              className="underline underline-offset-4 disabled:opacity-50"
              onClick={startOver}
              disabled={busy}
            >
              start over
            </button>
            .
          </p>
        )}

        {files.length === 0 ? (
          <FolderDrop
            dragging={dragging}
            disabled={busy}
            onFiles={selectFiles}
            onError={setMessage}
          />
        ) : (
          <div className="grid flex-1 gap-6 duration-300 motion-safe:animate-in motion-safe:fade-in md:grid-cols-[16rem_1fr]">
            <div className="flex flex-col gap-5">
              <div>
                <FolderOpen className="size-6 text-muted-foreground" />
                <p className="mt-3 text-2xl font-semibold tracking-tight">
                  {files.length} {files.length === 1 ? "file" : "files"}
                </p>
                <p className="text-muted-foreground">
                  {formatBytes(totalSize)}
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  {dragging
                    ? "Drop to replace these files."
                    : "Drop other files to replace them."}
                </p>
              </div>

              {stage === "uploading" && (
                <div className="space-y-2 text-sm" aria-live="polite">
                  <div className="flex justify-between gap-2">
                    <Working>
                      Uploading {uploaded} of {files.length}
                    </Working>
                    <span className="text-muted-foreground">{percentage}%</span>
                  </div>
                  <Progress value={percentage} aria-label="Upload progress" />
                </div>
              )}

              {statusText[stage] && (
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  <Working>{statusText[stage]}</Working>
                </p>
              )}

              {message && (
                <p role="alert" className="text-sm text-destructive">
                  {message}
                </p>
              )}

              <div className="mt-auto flex gap-3">
                <Button
                  type="button"
                  className="flex-1"
                  disabled={busy}
                  onClick={publish}
                >
                  {busy
                    ? "Publishing…"
                    : !session
                      ? "Publish site"
                      : stage === "error"
                        ? "Retry upload"
                        : "Resume upload"}
                </Button>
                {busy ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => controller.current?.abort()}
                  >
                    Cancel
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setFiles([])}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </div>

            <div className="relative min-h-64 rounded-xl border bg-muted/30">
              <ul className="absolute inset-0 divide-y overflow-y-auto font-mono text-xs">
                {files.map(({ path, file }) => (
                  <li
                    className="flex justify-between gap-4 px-4 py-2"
                    key={path}
                  >
                    <span className="truncate" title={path}>
                      {path}
                    </span>
                    <span className="shrink-0 text-muted-foreground">
                      {formatBytes(file.size)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {files.length === 0 && message && (
          <p role="alert" className="text-center text-sm text-destructive">
            {message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
