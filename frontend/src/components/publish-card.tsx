import { useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import { ChevronRight } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { SizeInfo, Sizes } from "@/components/compression-saving";
import { Folder } from "@/components/detent/ui/Folder";
import { RollingText } from "@/components/detent/ui/RollingText";
import { stageSize } from "@/components/folder-drop";
import { NewSiteSettings } from "@/components/new-site-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { formatTime } from "@/lib/format";
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

function ProgressRow({
  value,
  label,
  children,
}: {
  value: number;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2 text-sm" aria-live="polite">
      <div className="flex justify-between gap-2">
        <Working>{children}</Working>
        <RollingText text={`${value}%`} className="text-muted-foreground" />
      </div>
      <Progress value={value} aria-label={label} />
    </div>
  );
}

export function PublishCard() {
  const {
    files,
    compressed,
    session,
    stage,
    message,
    target,
    lockedUntil,
    description,
    diff,
    unchanged,
    uploaded,
    uploadCount,
    busy,
    compressedSize,
    percentage,
    startOver,
    chooseTarget,
    slug,
    setSlug,
    expiresAt,
    setExpiresAt,
    setDescription,
    note,
    setNote,
    cancel,
    publish,
    takeOver,
  } = useUpload();
  const dragging = usePageDrop(!busy && stage !== "ready");
  const [sites, setSites] = useState<Deployment[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const token = loadToken();
    if (!token) return;
    // Without them, files can only go to a new site
    listDeployments(token).then(setSites, () => {});
  }, []);

  // Drops the update as well, returning to the site it was for
  async function clear() {
    if (target) {
      await navigate({
        to: "/sites/$slug",
        params: { slug: target },
        hash: "update",
        replace: true,
      });
    }
    startOver();
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
        "transition-shadow duration-300 ease-detent",
        dragging &&
          "shadow-[0_0_0_2px_color-mix(in_oklch,var(--ink)_14%,transparent),var(--elev-float)]",
      )}
    >
      <CardContent className="flex flex-1 flex-col">
        <div className="grid flex-1 gap-6 duration-300 motion-safe:animate-in motion-safe:fade-in md:grid-cols-[20rem_1fr]">
          <div className="flex flex-col gap-5">
            <div>
              <Folder
                open={dragging}
                sheets={files.slice(0, 4).map(({ path }) => ({
                  id: path,
                  name: path.slice(path.lastIndexOf("/") + 1),
                }))}
                pct={percentage}
                busy={stage === "uploading"}
              />
              <p className="mt-4 text-2xl font-semibold tracking-tighter">
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
                      {/* Only the slug, while the options also show descriptions */}
                      <SelectValue>{target ?? "A new site"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">A new site</SelectItem>
                      <SelectGroup>
                        <SelectLabel>Update a site</SelectLabel>
                        {sites.map(({ slug, description }) => (
                          <SelectItem key={slug} value={slug}>
                            <span className="flex min-w-0 flex-col">
                              <span className="font-mono">{slug}</span>
                              {description && (
                                <span className="max-w-64 truncate text-xs text-muted-foreground">
                                  {description}
                                </span>
                              )}
                            </span>
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
              {!target && !session && (
                <NewSiteSettings
                  slug={slug}
                  onSlug={setSlug}
                  expiresAt={expiresAt}
                  onExpiry={setExpiresAt}
                  disabled={busy}
                />
              )}
              {diff && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {unchanged
                    ? "No changes"
                    : changeSummary(diff.changes, diff.removed.length)}
                </p>
              )}
              {target && !session && (
                <div className="mt-4 space-y-1.5">
                  <label
                    htmlFor="version-description"
                    className="text-sm text-muted-foreground"
                  >
                    What changed (optional)
                  </label>
                  <Input
                    id="version-description"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Shown with this version"
                    maxLength={200}
                    disabled={busy}
                  />
                </div>
              )}
              {!session ? (
                <div className="mt-4 space-y-1.5">
                  <label
                    htmlFor="site-description"
                    className="text-sm text-muted-foreground"
                  >
                    Description (optional)
                  </label>
                  <Input
                    id="site-description"
                    value={description ?? ""}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="What's this site for?"
                    maxLength={200}
                    disabled={busy}
                  />
                </div>
              ) : (
                session.description && (
                  <p className="mt-3 text-sm break-words text-muted-foreground">
                    {session.description}
                  </p>
                )
              )}
            </div>

            {compressedSize === null && stage === "idle" && !message && (
              <ProgressRow
                value={compressedPercentage}
                label="Compression progress"
              >
                Compressing {compressedCount} of {files.length}
              </ProgressRow>
            )}

            {stage === "uploading" && (
              <ProgressRow value={percentage} label="Upload progress">
                Uploading {uploaded} of {uploadCount}
              </ProgressRow>
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
                <Button type="button" variant="ghost" onClick={clear}>
                  Clear
                </Button>
              )}
            </div>
          </div>

          {/* The fade sits on the scrolling viewport, so it dissolves the rows and not the border */}
          <div className="relative min-h-40 rounded-xl border bg-muted/30 md:min-h-64">
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
