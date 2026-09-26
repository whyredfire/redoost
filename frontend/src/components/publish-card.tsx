import { CircleCheck, ExternalLink, FolderOpen } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { CompressionSaving, Sizes } from "@/components/compression-saving";
import { CopyButton } from "@/components/copy-button";
import { SitePreview } from "@/components/site-preview";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDate, siteUrl } from "@/lib/format";
import { usePageDrop, useUpload, type Stage } from "@/lib/upload";

const statusText: Partial<Record<Stage, string>> = {
  hashing: "Checking files…",
  creating: "Preparing upload…",
  completing: "Publishing site…",
};

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

// The selected files before publishing, then the live site
export function PublishCard() {
  const {
    files,
    compressed,
    session,
    stage,
    message,
    uploaded,
    busy,
    totalSize,
    compressedSize,
    percentage,
    clearFiles,
    startOver,
    cancel,
    publish,
  } = useUpload();
  const dragging = usePageDrop(!busy && stage !== "ready");
  const reduceMotion = useReducedMotion();

  if (stage === "ready" && session) {
    const url = siteUrl(session.deployment.slug);
    return (
      <Card className="min-h-[max(26rem,calc(100svh-14rem))] justify-center">
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
      className={`min-h-[max(26rem,calc(100svh-14rem))] transition-colors duration-300 ${dragging ? "border-foreground/20" : ""}`}
    >
      <CardContent className="flex flex-1 flex-col">
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
                <Button type="button" variant="outline" onClick={cancel}>
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
      </CardContent>
    </Card>
  );
}
