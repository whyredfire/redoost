import type {
  SelectRootItemComponentProps,
  SelectRootSectionComponentProps,
} from "@kobalte/core/select";
import { useNavigate } from "@tanstack/solid-router";
import { cn } from "cn";
import type { JSX } from "@solidjs/web";
import {
  createMemo,
  createSignal,
  For,
  onSettled,
  Show,
  type Accessor,
} from "solid-js";
import { SizeInfo, Sizes } from "@/components/compression-saving";
import { Folder } from "@/components/detent/ui/Folder";
import { RollingText } from "@/components/detent/ui/RollingText";
import { stageSize } from "@/components/folder-drop";
import { ChevronRight } from "@/components/icons";
import { NewSiteSettings } from "@/components/new-site-settings";
import { ThinkingOrb } from "@/components/thinking-orb";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
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

type SiteChoice = { value: string; label: string; description?: string };
type SiteGroup = { label: string; options: SiteChoice[] };

const newSite: SiteChoice = { value: "new", label: "A new site" };

function FileRow(props: ListedFile & { compressed: number | null }) {
  const slash = () => props.path.lastIndexOf("/") + 1;
  return (
    <li class="flex justify-between gap-4 px-4 py-2">
      <span
        title={props.path}
        class={`flex min-w-0 ${props.file ? "" : "text-muted-foreground line-through"}`}
      >
        <span class="min-w-0 truncate text-muted-foreground">
          {props.path.slice(0, slash())}
        </span>
        <span class="max-w-full shrink-0 break-all">
          {props.path.slice(slash())}
        </span>
      </span>
      <span class="flex shrink-0 gap-3">
        <Show when={props.change}>
          {(change) => <span class={changeColor[change()]}>{change()}</span>}
        </Show>
        <Show when={props.file}>
          {(file) => (
            <span class="text-muted-foreground">
              <Sizes original={file().size} compressed={props.compressed} />
            </span>
          )}
        </Show>
      </span>
    </li>
  );
}

// Rows are keyed by path, so a row stays put while its file's details change
function Rows(props: {
  files: ListedFile[];
  row: (file: Accessor<ListedFile>) => JSX.Element;
}) {
  return (
    <For each={props.files} keyed={(file) => file.path}>
      {(file) => props.row(file)}
    </For>
  );
}

function FileSection(props: {
  title: string;
  files: ListedFile[];
  row: (file: Accessor<ListedFile>) => JSX.Element;
}) {
  const [open, setOpen] = createSignal(true);
  return (
    <>
      <li>
        <button
          type="button"
          class="flex w-full items-center gap-1.5 bg-muted/50 px-4 py-1.5 font-sans font-medium text-muted-foreground transition-colors hover:text-foreground"
          aria-expanded={open() ? "true" : "false"}
          onClick={() => setOpen(!open())}
        >
          <ChevronRight
            class={`size-3.5 transition-transform ${open() ? "rotate-90" : ""}`}
          />
          {props.title} · {props.files.length}
        </button>
      </li>
      <Show when={open()}>
        <Rows files={props.files} row={props.row} />
      </Show>
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

function Working(props: { children: JSX.Element }) {
  return (
    <span class="flex items-center gap-2">
      <ThinkingOrb state="working" size={20} />
      {props.children}
    </span>
  );
}

function ProgressRow(props: {
  value: number;
  label: string;
  children: JSX.Element;
}) {
  return (
    <div class="space-y-2 text-sm" aria-live="polite">
      <div class="flex justify-between gap-2">
        <Working>{props.children}</Working>
        <RollingText text={`${props.value}%`} class="text-muted-foreground" />
      </div>
      <Progress value={props.value} aria-label={props.label} />
    </div>
  );
}

export function PublishCard() {
  const upload = useUpload();
  const dragging = usePageDrop(
    () => !upload.busy && upload.stage !== "ready",
  );
  const [sites, setSites] = createSignal<Deployment[]>([]);
  const navigate = useNavigate();

  onSettled(() => {
    const token = loadToken();
    if (!token) return;
    // Without them, files can only go to a new site
    listDeployments(token).then(
      (sites) => setSites(sites),
      () => {},
    );
  });

  // Drops the update as well, returning to the site it was for
  async function clear() {
    const target = upload.target;
    if (target) {
      await navigate({
        to: "/sites/$slug",
        params: { slug: target },
        hash: "update",
        replace: true,
      });
    }
    upload.startOver();
  }

  const listed = createMemo((): ListedFile[] => [
    ...upload.files.map(({ path, file }) => ({
      path,
      file,
      change: upload.diff?.changes.get(path),
    })),
    ...(upload.diff?.removed ?? []).map((path) => ({
      path,
      change: "removed" as const,
    })),
  ]);
  const compressedCount = () => Object.keys(upload.compressed).length;
  const compressedPercentage = () =>
    Math.floor((compressedCount() / upload.files.length) * 100);
  const compared = () => upload.diff !== null && upload.compressedSize !== null;
  // Split once every file is compared, so rows don't jump between sections
  const split = () => compared() && !upload.unchanged;
  // Updates show what they upload rather than the whole site
  const uploadFiles = createMemo(() => {
    const diff = upload.diff;
    return compared() && diff
      ? upload.files.filter(({ path }) => diff.changes.has(path))
      : upload.files;
  });
  const uploadSize = () =>
    uploadFiles().reduce((sum, { file }) => sum + file.size, 0);
  const uploadCompressed = () =>
    compared()
      ? uploadFiles().reduce(
          (sum, { path }) => sum + (upload.compressed[path]?.file.size ?? 0),
          0,
        )
      : upload.compressedSize;
  const changedFiles = createMemo(() =>
    listed()
      .filter(({ change }) => change)
      .sort((a, b) => a.path.localeCompare(b.path)),
  );
  const unchangedFiles = createMemo(() =>
    listed().filter(({ change }) => !change),
  );
  const row = (listedFile: Accessor<ListedFile>) => (
    <FileRow
      path={listedFile().path}
      file={listedFile().file}
      change={listedFile().change}
      compressed={upload.compressed[listedFile().path]?.file.size ?? null}
    />
  );
  const siteChoices = createMemo((): (SiteChoice | SiteGroup)[] => [
    newSite,
    {
      label: "Update a site",
      options: sites().map(({ slug, description }) => ({
        value: slug,
        label: slug,
        description: description || undefined,
      })),
    },
  ]);
  const chosen = createMemo(() => {
    const target = upload.target;
    if (!target) return newSite;
    return (
      (siteChoices()[1] as SiteGroup).options.find(
        ({ value }) => value === target,
      ) ?? { value: target, label: target }
    );
  });

  return (
    <Card
      class={cn(
        stageSize,
        "transition-shadow duration-300 ease-detent",
        dragging() &&
          "shadow-[0_0_0_2px_color-mix(in_oklch,var(--ink)_14%,transparent),var(--elev-float)]",
      )}
    >
      <CardContent class="flex flex-1 flex-col">
        <div class="grid flex-1 gap-6 duration-300 motion-safe:animate-in motion-safe:fade-in md:grid-cols-[20rem_1fr]">
          <div class="flex flex-col gap-5">
            <div>
              <Folder
                open={dragging()}
                sheets={upload.files.slice(0, 4).map(({ path }) => ({
                  id: path,
                  name: path.slice(path.lastIndexOf("/") + 1),
                }))}
                pct={upload.percentage}
                busy={upload.stage === "uploading"}
              />
              <p class="mt-4 text-2xl font-semibold tracking-tighter">
                {upload.files.length}{" "}
                {upload.files.length === 1 ? "file" : "files"}
              </p>
              <div class="flex items-center gap-1.5 text-muted-foreground">
                <Sizes original={uploadSize()} compressed={uploadCompressed()} />
                <SizeInfo update={compared()} />
              </div>
              <p class="mt-3 text-sm text-muted-foreground">
                {dragging()
                  ? "Drop to replace these files."
                  : "Drop other files to replace them."}
              </p>
              <Show
                when={sites().length > 0 && !upload.session && !upload.busy}
                fallback={
                  <Show when={upload.target}>
                    {(target) => (
                      <p class="mt-3 text-sm">
                        Updates <span class="font-mono">{target()}</span>
                      </p>
                    )}
                  </Show>
                }
              >
                <div class="mt-4 space-y-1.5">
                  <p class="text-sm text-muted-foreground">Publish as</p>
                  <Select
                    options={siteChoices()}
                    optionValue="value"
                    optionTextValue="label"
                    optionGroupChildren="options"
                    value={chosen()}
                    onChange={(choice: SiteChoice | null) => {
                      if (choice)
                        upload.chooseTarget(
                          choice.value === "new" ? null : choice.value,
                        );
                    }}
                    itemComponent={(
                      item: SelectRootItemComponentProps<SiteChoice>,
                    ) => (
                      <SelectItem item={item.item}>
                        <Show
                          when={item.item.rawValue.value !== "new"}
                          fallback="A new site"
                        >
                          <span class="flex min-w-0 flex-col">
                            <span class="font-mono">
                              {item.item.rawValue.value}
                            </span>
                            <Show when={item.item.rawValue.description}>
                              <span class="max-w-64 truncate text-xs text-muted-foreground">
                                {item.item.rawValue.description}
                              </span>
                            </Show>
                          </span>
                        </Show>
                      </SelectItem>
                    )}
                    sectionComponent={(
                      section: SelectRootSectionComponentProps<SiteGroup>,
                    ) => <SelectLabel>{section.section.rawValue.label}</SelectLabel>}
                  >
                    <SelectTrigger
                      class={`w-full ${upload.target ? "font-mono" : ""}`}
                      aria-label="Publish as"
                    >
                      {/* Only the slug, while the options also show descriptions */}
                      <SelectValue>{() => upload.target ?? "A new site"}</SelectValue>
                    </SelectTrigger>
                    <SelectContent />
                  </Select>
                </div>
              </Show>
              <Show when={!upload.target && !upload.session}>
                <NewSiteSettings
                  slug={upload.slug}
                  onSlug={upload.setSlug}
                  expiresAt={upload.expiresAt}
                  onExpiry={upload.setExpiresAt}
                  disabled={upload.busy}
                />
              </Show>
              <Show when={upload.diff}>
                {(diff) => (
                  <p class="mt-2 text-sm text-muted-foreground">
                    {upload.unchanged
                      ? "No changes"
                      : changeSummary(diff().changes, diff().removed.length)}
                  </p>
                )}
              </Show>
              <Show when={upload.target && !upload.session}>
                <div class="mt-4 space-y-1.5">
                  <label
                    for="version-description"
                    class="text-sm text-muted-foreground"
                  >
                    What changed (optional)
                  </label>
                  <Input
                    id="version-description"
                    value={upload.note}
                    onInput={(event) => upload.setNote(event.currentTarget.value)}
                    placeholder="Shown with this version"
                    maxlength={200}
                    disabled={upload.busy}
                  />
                </div>
              </Show>
              <Show
                when={!upload.session}
                fallback={
                  <Show when={upload.session?.description}>
                    <p class="mt-3 text-sm break-words text-muted-foreground">
                      {upload.session?.description}
                    </p>
                  </Show>
                }
              >
                <div class="mt-4 space-y-1.5">
                  <label
                    for="site-description"
                    class="text-sm text-muted-foreground"
                  >
                    Description (optional)
                  </label>
                  <Input
                    id="site-description"
                    value={upload.description ?? ""}
                    onInput={(event) =>
                      upload.setDescription(event.currentTarget.value)
                    }
                    placeholder="What's this site for?"
                    maxlength={200}
                    disabled={upload.busy}
                  />
                </div>
              </Show>
            </div>

            <Show
              when={
                upload.compressedSize === null &&
                upload.stage === "idle" &&
                !upload.message
              }
            >
              <ProgressRow
                value={compressedPercentage()}
                label="Compression progress"
              >
                Compressing {compressedCount()} of {upload.files.length}
              </ProgressRow>
            </Show>

            <Show when={upload.stage === "uploading"}>
              <ProgressRow value={upload.percentage} label="Upload progress">
                Uploading {upload.uploaded} of {upload.uploadCount}
              </ProgressRow>
            </Show>

            <Show when={statusText[upload.stage]}>
              {(text) => (
                <p class="text-sm text-muted-foreground" aria-live="polite">
                  <Working>{text()}</Working>
                </p>
              )}
            </Show>

            <Show when={upload.message}>
              <p role="alert" class="text-sm text-destructive">
                {upload.message}
              </p>
            </Show>

            <Show when={upload.lockedUntil && !upload.busy}>
              <div class="space-y-3 text-sm text-muted-foreground">
                <p>
                  It frees up at {formatTime(upload.lockedUntil!)}. If it was
                  abandoned, like in a closed tab, you can cancel it now. An
                  upload still running elsewhere would mix its files with these.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => upload.takeOver()}
                >
                  Cancel the other upload
                </Button>
              </div>
            </Show>

            <div class="mt-auto flex gap-3">
              <Button
                type="button"
                class="flex-1"
                disabled={
                  upload.busy ||
                  upload.unchanged ||
                  upload.compressedSize === null
                }
                onClick={() => upload.publish()}
              >
                {upload.busy
                  ? "Publishing…"
                  : !upload.session
                    ? upload.target
                      ? "Update site"
                      : "Publish site"
                    : upload.stage === "error"
                      ? "Retry upload"
                      : "Resume upload"}
              </Button>
              <Show
                when={upload.busy}
                fallback={
                  <Button type="button" variant="ghost" onClick={clear}>
                    Clear
                  </Button>
                }
              >
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => upload.cancel()}
                >
                  Cancel
                </Button>
              </Show>
            </div>
          </div>

          {/* The fade sits on the scrolling viewport, so it dissolves the rows and not the border */}
          <div class="relative min-h-40 rounded-xl border bg-muted/30 md:min-h-64">
            {/* Radix pins the root to position: relative, so this div takes the space */}
            <div class="absolute inset-0">
              <ScrollArea class="h-full [&>[data-slot=scroll-area-viewport]]:scroll-fade">
                <ul class="divide-y font-mono text-xs">
                  <Show
                    when={split()}
                    fallback={<Rows files={listed()} row={row} />}
                  >
                    <FileSection
                      title="Changed"
                      files={changedFiles()}
                      row={row}
                    />
                    <Show when={unchangedFiles().length > 0}>
                      <FileSection
                        title="Unchanged"
                        files={unchangedFiles()}
                        row={row}
                      />
                    </Show>
                  </Show>
                </ul>
              </ScrollArea>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
