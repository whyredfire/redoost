import { cn } from "cn";
import { Link } from "@tanstack/react-router";
import { ChevronRight, ExternalLink, FolderOpen } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import { ThinkingOrb } from "thinking-orbs";
import {
  CompressionSaving,
  SizeInfo,
  Sizes,
} from "@/components/compression-saving";
import { stageSize } from "@/components/folder-drop";
import { SiteAddress } from "@/components/site-address";
import { SitePreview } from "@/components/site-preview";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listDeployments, type Deployment } from "@/lib/deploy";
import { formatTime, siteUrl } from "@/lib/format";
import type { FileChange } from "@/lib/site-files";
import { loadToken } from "@/lib/session";
import { usePageDrop, useUpload, type Stage } from "@/lib/upload";

const statusText: Partial<Record<Stage, string>> = {
  hashing: "Checking files…",
  creating: "Preparing upload…",
  completing: "Publishing site…",
};

type ListedFile = {
  path: string;
  // Missing for files that are only on the server
  file?: File;
  change?: FileChange | "removed";
};

const changeColor: Record<FileChange | "removed", string> = {
  new: "text-emerald-600 dark:text-emerald-500",
  changed: "text-amber-600 dark:text-amber-500",
  removed: "text-destructive",
};

function FileRow({
  path,
  file,
  change,
  compressed,
}: ListedFile & { compressed: number | null }) {
  const slash = path.lastIndexOf("/") + 1;
  return (
    <li className="flex justify-between gap-4 px-4 py-2">
      <span
        title={path}
        className={`flex min-w-0 ${file ? "" : "text-muted-foreground line-through"}`}
      >
        <span className="min-w-0 truncate text-muted-foreground">
          {path.slice(0, slash)}
        </span>
        <span className="max-w-full shrink-0 break-all">
          {path.slice(slash)}
        </span>
      </span>
      <span className="flex shrink-0 gap-3">
        {change && <span className={changeColor[change]}>{change}</span>}
        {file && (
          <span className="text-muted-foreground">
            <Sizes original={file.size} compressed={compressed} />
          </span>
        )}
      </span>
    </li>
  );
}

function FileSection({
  title,
  files,
  row,
}: {
  title: string;
  files: ListedFile[];
  row: (file: ListedFile) => ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <li>
        <button
          type="button"
          className="flex w-full items-center gap-1.5 bg-muted/50 px-4 py-1.5 font-sans font-medium text-muted-foreground transition-colors hover:text-foreground"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <ChevronRight
            className={`size-3.5 transition-transform ${open ? "rotate-90" : ""}`}
          />
          {title} · {files.length}
        </button>
      </li>
      {open && files.map(row)}
    </>
  );
}

function changeSummary(changes: Map<string, FileChange>, removed: number) {
  const changed = [...changes.values()].filter(
    (change) => change === "changed",
  ).length;
  const counts = [
    [changes.size - changed, "new"],
    [changed, "changed"],
    [removed, "removed"],
  ] as const;
  return counts
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${count} ${label}`)
    .join(" · ");
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

// The selected files before publishing, then the live site
export function PublishCard() {
  const {
    files,
    compressed,
    session,
    stage,
    message,
    target,
    lockedUntil,
    diff,
    unchanged,
    uploaded,
    uploadCount,
    busy,
    compressedSize,
    percentage,
    clearFiles,
    startOver,
    chooseTarget,
    cancel,
    publish,
    takeOver,
  } = useUpload();
  const dragging = usePageDrop(!busy && stage !== "ready");
  const [sites, setSites] = useState<Deployment[]>([]);

  useEffect(() => {
    const token = loadToken();
    if (!token) return;
    // Without them, files can only go to a new site
    listDeployments(token).then(setSites, () => {});
  }, []);
  const reduceMotion = useReducedMotion();

  if (stage === "ready" && session) {
    const slug = session.deployment.slug;
    const url = siteUrl(slug);
    return (
      <Card className={cn(stageSize, "py-0")}>
        <MotionCardContent
          className="flex flex-1 flex-col gap-6 py-6 lg:px-8 lg:py-8"
          variants={stagger}
          initial={reduceMotion ? false : "hidden"}
          animate="shown"
        >
          <motion.div
            variants={rise}
            className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"
          >
            <div className="min-w-0 space-y-3 lg:max-w-xl lg:flex-1">
              <h1 className="text-3xl font-semibold tracking-tighter text-balance sm:text-4xl">
                {target ? "It's updated." : "It's live."}{" "}
                <span className="text-muted-foreground">
                  {target
                    ? "Same address, new files."
                    : "Share it with anyone."}
                </span>
              </h1>
              <SiteAddress slug={slug} />
              {session.originalSize !== undefined && (
                <CompressionSaving
                  original={session.originalSize}
                  uploaded={session.deployment.total_size}
                />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {url && (
                <Button asChild>
                  <a href={url} target="_blank" rel="noreferrer">
                    <ExternalLink />
                    Open site
                  </a>
                </Button>
              )}
              <Button variant="outline" asChild>
                <Link to="/sites/$slug" params={{ slug }}>
                  Manage site
                </Link>
              </Button>
              <Button type="button" variant="ghost" onClick={startOver}>
                Publish another site
              </Button>
            </div>
          </motion.div>
          {url && (
            <motion.div
              variants={rise}
              className="flex min-h-0 flex-1 flex-col"
            >
              <SitePreview url={url} fill />
            </motion.div>
          )}
        </MotionCardContent>
      </Card>
    );
  }

  const listed: ListedFile[] = [
    ...files.map(({ path, file }) => ({
      path,
      file,
      change: diff?.changes.get(path),
    })),
    ...(diff?.removed ?? []).map((path) => ({
      path,
      change: "removed" as const,
    })),
  ];
  const compressedCount = Object.keys(compressed).length;
  const compressedPercentage = Math.floor(
    (compressedCount / files.length) * 100,
  );
  const compared = diff !== null && compressedSize !== null;
  // Split once every file is compared, so rows don't jump between sections
  const split = compared && !unchanged;
  // Updates show what they upload rather than the whole site
  const uploadFiles = compared
    ? files.filter(({ path }) => diff.changes.has(path))
    : files;
  const uploadSize = uploadFiles.reduce((sum, { file }) => sum + file.size, 0);
  const uploadCompressed = compared
    ? uploadFiles.reduce(
        (sum, { path }) => sum + (compressed[path]?.file.size ?? 0),
        0,
      )
    : compressedSize;
  const changedFiles = listed
    .filter(({ change }) => change)
    .sort((a, b) => a.path.localeCompare(b.path));
  const unchangedFiles = listed.filter(({ change }) => !change);
  const row = (listedFile: ListedFile) => (
    <FileRow
      key={listedFile.path}
      {...listedFile}
      compressed={compressed[listedFile.path]?.file.size ?? null}
    />
  );

  return (
    <Card
      className={cn(
        stageSize,
        "transition-colors duration-300",
        dragging && "border-foreground/20",
      )}
    >
      <CardContent className="flex flex-1 flex-col">
        <div className="grid flex-1 gap-6 duration-300 motion-safe:animate-in motion-safe:fade-in md:grid-cols-[16rem_1fr]">
          <div className="flex flex-col gap-5">
            <div>
              <FolderOpen className="size-6 text-muted-foreground" />
              <p className="mt-3 text-2xl font-semibold tracking-tighter">
                {files.length} {files.length === 1 ? "file" : "files"}
              </p>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Sizes original={uploadSize} compressed={uploadCompressed} />
                <SizeInfo update={compared} />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {dragging
                  ? "Drop to replace these files."
                  : "Drop other files to replace them."}
              </p>
              {sites.length > 0 && !session && !busy ? (
                <div className="mt-4 space-y-1.5">
                  <p className="text-sm text-muted-foreground">Publish as</p>
                  <Select
                    value={target ?? "new"}
                    onValueChange={(value) =>
                      chooseTarget(value === "new" ? null : value)
                    }
                  >
                    <SelectTrigger
                      className={`w-full ${target ? "font-mono" : ""}`}
                      aria-label="Publish as"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">A new site</SelectItem>
                      <SelectGroup>
                        <SelectLabel>Update a site</SelectLabel>
                        {sites.map(({ slug }) => (
                          <SelectItem
                            key={slug}
                            value={slug}
                            className="font-mono"
                          >
                            {slug}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                target && (
                  <p className="mt-3 text-sm">
                    Updates <span className="font-mono">{target}</span>
                  </p>
                )
              )}
              {diff && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {unchanged
                    ? "No changes"
                    : changeSummary(diff.changes, diff.removed.length)}
                </p>
              )}
            </div>

            {compressedSize === null && stage === "idle" && !message && (
              <div className="space-y-2 text-sm" aria-live="polite">
                <div className="flex justify-between gap-2">
                  <Working>
                    Compressing {compressedCount} of {files.length}
                  </Working>
                  <span className="text-muted-foreground">
                    {compressedPercentage}%
                  </span>
                </div>
                <Progress
                  value={compressedPercentage}
                  aria-label="Compression progress"
                />
              </div>
            )}

            {stage === "uploading" && (
              <div className="space-y-2 text-sm" aria-live="polite">
                <div className="flex justify-between gap-2">
                  <Working>
                    Uploading {uploaded} of {uploadCount}
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

            {lockedUntil && !busy && (
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  It frees up at {formatTime(lockedUntil)}. If it was abandoned,
                  like in a closed tab, you can cancel it now. An upload still
                  running elsewhere would mix its files with these.
                </p>
                <Button type="button" variant="outline" onClick={takeOver}>
                  Cancel the other upload
                </Button>
              </div>
            )}

            <div className="mt-auto flex gap-3">
              <Button
                type="button"
                className="flex-1"
                disabled={busy || unchanged || compressedSize === null}
                onClick={publish}
              >
                {busy
                  ? "Publishing…"
                  : !session
                    ? target
                      ? "Update site"
                      : "Publish site"
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
                  {split ? (
                    <>
                      <FileSection
                        title="Changed"
                        files={changedFiles}
                        row={row}
                      />
                      {unchangedFiles.length > 0 && (
                        <FileSection
                          title="Unchanged"
                          files={unchangedFiles}
                          row={row}
                        />
                      )}
                    </>
                  ) : (
                    listed.map(row)
                  )}
                </ul>
              </ScrollArea>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
