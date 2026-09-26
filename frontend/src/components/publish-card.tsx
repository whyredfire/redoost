import { CircleCheck, ExternalLink, FolderOpen } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { CompressionSaving, Sizes } from "@/components/compression-saving";
import { CopyButton } from "@/components/copy-button";
import { FolderDrop } from "@/components/folder-drop";
import { SitePreview } from "@/components/site-preview";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  completeDeployment,
  createDeployment,
  readLimits,
  uploadFiles,
  type Limits,
  type ManifestFile,
  type UploadSession,
} from "@/lib/deploy";
import { formatBytes, formatDate, siteUrl } from "@/lib/format";
import {
  clearSession,
  loadSession,
  loadToken,
  saveSession,
  saveToken,
} from "@/lib/session";
import {
  compressFiles,
  droppedFiles,
  fileManifest,
  siteChecks,
  type SiteCheck,
  type SiteFile,
  type UploadFile,
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

const MotionCardContent = motion.create(CardContent);

// The live page's sections rise in one after another
const stagger = { shown: { transition: { staggerChildren: 0.08 } } };
const rise = {
  hidden: { opacity: 0, y: 12, filter: "blur(4px)" },
  shown: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.4, ease: "easeOut" as const },
  },
};

type PublishCardProps = {
  onEmptyChange: (empty: boolean) => void;
  // Increases when the user asks to start over from the header
  resetSignal: number;
};

export function PublishCard({ onEmptyChange, resetSignal }: PublishCardProps) {
  const [files, setFiles] = useState<SiteFile[]>([]);
  const [compressed, setCompressed] = useState<Record<string, UploadFile>>({});
  const [session, setSession] = useState<UploadSession | null>(loadSession);
  const [stage, setStage] = useState<Stage>(
    session?.deployment.state === "ready" ? "ready" : "idle",
  );
  const [message, setMessage] = useState("");
  const [checks, setChecks] = useState<SiteCheck[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [uploaded, setUploaded] = useState(0);
  const [uploadSize, setUploadSize] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [limits, setLimits] = useState<Limits | null>(null);
  const reduceMotion = useReducedMotion();
  const controller = useRef<AbortController | null>(null);
  // Files are compressed as soon as they're selected, and Publish reuses it
  const compression = useRef<Promise<UploadFile[]> | null>(null);

  const busy = ["hashing", "creating", "uploading", "completing"].includes(
    stage,
  );
  const totalSize = files.reduce((sum, { file }) => sum + file.size, 0);
  const compressedFiles = Object.values(compressed);
  const compressedSize =
    compressedFiles.length === files.length
      ? compressedFiles.reduce((sum, { file }) => sum + file.size, 0)
      : null;
  const loaded = Object.values(progress).reduce((sum, bytes) => sum + bytes, 0);
  const percentage = uploadSize ? Math.round((loaded / uploadSize) * 100) : 0;

  useEffect(() => {
    // Without limits, the API still rejects oversized sites when publishing
    readLimits()
      .then(setLimits)
      .catch(() => {});
  }, []);

  function clearFiles() {
    compression.current = null;
    setFiles([]);
    setCompressed({});
    setMessage("");
    setChecks([]);
  }

  // Errors outside publishing replace the files and show in the drop box
  function showError(message: string) {
    clearFiles();
    setMessage(message);
  }

  // Sends the user back to the drop box with a checklist if anything fails
  function rejected(uploads: SiteFile[]) {
    const results = siteChecks(uploads, limits);
    if (results.every(({ passed }) => passed)) return false;
    clearFiles();
    setChecks(results);
    return true;
  }

  async function selectFiles(selected: SiteFile[]) {
    if (!selected.length) {
      showError("This folder has no files.");
      return;
    }
    clearFiles();
    setStage("idle");
    // Without index.html the files are only checked, never listed
    if (selected.some(({ path }) => path === "index.html")) {
      setFiles(selected);
    }

    const run = compressFiles(selected, (file) => {
      if (compression.current === run) {
        setCompressed((current) => ({ ...current, [file.path]: file }));
      }
    });
    compression.current = run;
    try {
      const uploads = await run;
      if (compression.current === run) rejected(uploads);
    } catch (error) {
      if (compression.current !== run) return;
      showError(error instanceof Error ? error.message : String(error));
    }
  }

  function startOver() {
    controller.current?.abort();
    clearSession();
    setSession(null);
    clearFiles();
    setStage("idle");
  }

  async function publish() {
    const abort = new AbortController();
    controller.current = abort;
    setMessage("");
    setStage("hashing");

    try {
      const uploads = await compression.current!;
      if (rejected(uploads)) {
        setStage("idle");
        return;
      }
      const manifest = await fileManifest(uploads);
      abort.signal.throwIfAborted();

      let active = session;
      if (!active) {
        setStage("creating");
        const deployment = await createDeployment(
          manifest,
          loadToken(),
          abort.signal,
        );
        active = { deployment, manifest, originalSize: totalSize };
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
      setUploadSize(uploads.reduce((sum, { file }) => sum + file.size, 0));
      setStage("uploading");
      await uploadFiles(
        active.deployment,
        uploads,
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
        deployment: {
          ...active.deployment,
          state: result.state,
          available_until: result.available_until,
        },
      };
      saveSession(finished);
      setSession(finished);
      setStage("ready");
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

  // Only changes after mounting count, and a running upload is never dropped
  const seenReset = useRef(resetSignal);
  useEffect(() => {
    if (resetSignal === seenReset.current) return;
    seenReset.current = resetSignal;
    if (!busy) startOver();
  }, [resetSignal, busy]);

  // The whole page is the drop target, so a stray drop never opens the file
  useEffect(() => {
    // Elements the drag is over; a count breaks when one is removed mid-drag
    const entered = new Set<Node>();
    const hasFiles = (event: DragEvent) =>
      event.dataTransfer?.types.includes("Files") ?? false;

    function enter(event: DragEvent) {
      if (!hasFiles(event)) return;
      entered.add(event.target as Node);
      setDragging(acceptsDrop);
    }
    function over(event: DragEvent) {
      if (hasFiles(event)) event.preventDefault();
    }
    function leave(event: DragEvent) {
      if (!hasFiles(event)) return;
      entered.delete(event.target as Node);
      // Removed elements never fire dragleave
      for (const node of entered) {
        if (!node.isConnected) entered.delete(node);
      }
      if (entered.size === 0) setDragging(false);
    }
    async function drop(event: DragEvent) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      entered.clear();
      setDragging(false);
      const items = event.dataTransfer?.items;
      if (!acceptsDrop || !items) return;
      try {
        const selected = await droppedFiles(items);
        selectFiles(selected);
      } catch (error) {
        showError(error instanceof Error ? error.message : String(error));
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
        <MotionCardContent
          className="mx-auto w-full max-w-xl space-y-6 text-center"
          variants={stagger}
          initial={reduceMotion ? false : "hidden"}
          animate="shown"
        >
          {url && (
            <motion.div variants={rise}>
              <SitePreview url={url} />
            </motion.div>
          )}
          <motion.div variants={rise}>
            <p className="flex items-center justify-center gap-2 text-xl font-semibold">
              <CircleCheck className="size-5 text-emerald-600 dark:text-emerald-500" />
              Your site is live
            </p>
            <p className="mt-1 text-muted-foreground">
              Share this address with anyone.
              {session.deployment.available_until &&
                ` It stays online until ${formatDate(session.deployment.available_until)}.`}
            </p>
            {session.originalSize !== undefined && (
              <div className="mt-2">
                <CompressionSaving
                  original={session.originalSize}
                  uploaded={session.deployment.total_size}
                />
              </div>
            )}
          </motion.div>
          <motion.div
            variants={rise}
            className="flex items-center gap-1 rounded-xl border bg-muted/40 py-1 pr-1 pl-4 text-left"
          >
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
          </motion.div>
          <motion.div variants={rise}>
            <Button type="button" variant="outline" onClick={startOver}>
              Publish another site
            </Button>
          </motion.div>
        </MotionCardContent>
      </Card>
    );
  }

  return (
    <Card
      className={`min-h-(--publish-height) transition-colors duration-300 motion-safe:transition-[min-height,color,background-color,border-color,box-shadow] ${files.length === 0 ? "border-0 bg-transparent py-0 shadow-none" : dragging ? "border-foreground/20" : ""}`}
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
            error={message}
            checks={checks}
            onFiles={selectFiles}
            onError={showError}
            onDismiss={clearFiles}
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
                  <Sizes original={totalSize} compressed={compressedSize} />
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
                  <Button type="button" variant="ghost" onClick={clearFiles}>
                    Clear
                  </Button>
                )}
              </div>
            </div>

            {/* The fade sits on the scrolling viewport, so it dissolves the rows and not the border */}
            <div className="relative min-h-64 rounded-xl border bg-muted/30">
              {/* Radix pins the root to position: relative, so this div takes the space */}
              <div className="absolute inset-0">
                <ScrollArea className="h-full [&>[data-slot=scroll-area-viewport]]:scroll-fade">
                  <ul className="divide-y font-mono text-xs">
                    {files.map(({ path, file }) => (
                      <li
                        className="flex justify-between gap-4 px-4 py-2"
                        key={path}
                      >
                        <span className="truncate">{path}</span>
                        <span className="shrink-0 text-muted-foreground">
                          <Sizes
                            original={file.size}
                            compressed={compressed[path]?.file.size ?? null}
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
