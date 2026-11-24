import type { JSX } from "@solidjs/web";
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onSettled,
  useContext,
  type Accessor,
} from "solid-js";
import { ApiError } from "./api";
import {
  cancelUpload,
  completeDeployment,
  createDeployment,
  readDeployment,
  readFiles,
  readLimits,
  updateDeployment,
  type DeploymentUploads,
  type Limits,
  type ManifestFile,
  type StoredFile,
  type UploadSession,
} from "./deploy";
import { publishToken } from "./auth";
import { errorMessage } from "./format";
import { clearSession, loadSession, loadToken, saveSession } from "./session";
import {
  droppedFiles,
  fileManifest,
  prepareFiles,
  siteChanges,
  siteChecks,
  type SiteCheck,
  type SiteFile,
  type UploadFile,
} from "./site-files";
import { uploadFiles } from "./upload-files";

export type Stage =
  | "idle"
  | "hashing"
  | "creating"
  | "uploading"
  | "completing"
  | "ready"
  | "error";

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

// Batched, since each update re-renders every listed file
function batched(update: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  function flush() {
    clearTimeout(timer);
    timer = undefined;
    update();
  }
  function schedule() {
    timer ??= setTimeout(flush, 100);
  }
  return { schedule, flush };
}

function useUploadState() {
  const [files, setFiles] = createSignal<SiteFile[]>([]);
  const [compressed, setCompressed] = createSignal<Record<string, UploadFile>>(
    {},
  );
  const initialSession = loadSession();
  const [session, setSession] = createSignal<UploadSession | null>(
    initialSession,
  );
  const [stage, setStage] = createSignal<Stage>(
    initialSession?.deployment.state === "ready" ? "ready" : "idle",
  );
  const [message, setMessage] = createSignal("");
  // The site whose files the next publish replaces
  const [target, setTarget] = createSignal<string | null>(null);
  // The address picked for a new site; null leaves it to the server
  const [slug, setSlug] = createSignal<string | null>(null);
  // When a new site goes offline; null for never
  const [expiresAt, setExpiresAt] = createSignal<string | null>(null);
  // When another tab's or device's upload to the target frees it
  const [lockedUntil, setLockedUntil] = createSignal<string | null>(null);
  const [storedFiles, setStoredFiles] = createSignal<StoredFile[] | null>(null);
  // Null leaves an updated site's description as it is, as when it couldn't be read
  const [description, setDescription] = createSignal<string | null>(null);
  const [note, setNote] = createSignal("");
  const [checks, setChecks] = createSignal<SiteCheck[]>([]);
  const [loaded, setLoaded] = createSignal(0);
  const [uploaded, setUploaded] = createSignal(0);
  const [uploadCount, setUploadCount] = createSignal(0);
  const [uploadSize, setUploadSize] = createSignal(0);
  const [limits, setLimits] = createSignal<Limits | null>(null);
  let controller: AbortController | null = null;
  // Files are compressed and hashed as soon as they're selected, and Publish reuses them
  let preparation: Promise<UploadFile[]> | null = null;

  const busy = createMemo(() =>
    ["hashing", "creating", "uploading", "completing"].includes(stage()),
  );
  const live = createMemo(() => stage() === "ready" && session() !== null);
  const totalSize = () => files().reduce((sum, { file }) => sum + file.size, 0);
  const compressedFiles = createMemo(() => Object.values(compressed()));
  const compressedSize = createMemo(() =>
    compressedFiles().length === files().length
      ? compressedFiles().reduce((sum, { file }) => sum + file.size, 0)
      : null,
  );
  const diff = createMemo(() => {
    const stored = storedFiles();
    return stored && siteChanges(files(), compressedFiles(), stored);
  });
  const unchanged = createMemo(() => {
    const changes = diff();
    return (
      changes !== null &&
      compressedSize() !== null &&
      changes.changes.size === 0 &&
      changes.removed.length === 0
    );
  });
  const percentage = createMemo(() =>
    uploadSize() ? Math.round((loaded() / uploadSize()) * 100) : 0,
  );

  createEffect(target, (target) => {
    const token = loadToken();
    if (!target || !token) return;
    let current = true;
    readFiles(target, token)
      .then((files) => {
        if (current) setStoredFiles(files);
      })
      // Without them, the files are listed without changes
      .catch(() => {});
    readDeployment(target, token)
      .then((site) => {
        if (current) setDescription(site.description);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  });

  onSettled(() => {
    // Without limits, the API still rejects oversized sites when publishing
    readLimits()
      .then((limits) => setLimits(limits))
      .catch(() => {});
  });

  function forgetSite() {
    clearSession();
    setSession(null);
    setTarget(null);
    setSlug(null);
    setExpiresAt(null);
    setStoredFiles(null);
    setDescription(null);
    setNote("");
  }

  function clearFiles() {
    preparation = null;
    setFiles([]);
    setCompressed({});
    setMessage("");
    setLockedUntil(null);
    setChecks([]);
  }

  // Errors outside publishing replace the files and show in the drop box
  function showError(message: string) {
    clearFiles();
    setMessage(message);
  }

  // Sends the user back to the drop box with a checklist if anything fails
  function rejected(uploads: SiteFile[]) {
    const results = siteChecks(uploads, limits());
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
    // A published site is done with; new files start a new one
    if (live()) forgetSite();
    clearFiles();
    setStage("idle");
    // Before any file is read, so an oversized one can't fill the tab's memory
    if (rejected(selected)) return;
    // Without index.html the files are only checked, never listed
    if (selected.some(({ path }) => path === "index.html")) {
      setFiles(selected);
    }

    let batch: Record<string, UploadFile> = {};
    const { schedule, flush } = batched(() => {
      const prepared = batch;
      batch = {};
      if (preparation === run) {
        setCompressed((current) => ({ ...current, ...prepared }));
      }
    });
    const run = prepareFiles(selected, (file) => {
      batch[file.path] = file;
      schedule();
    });
    preparation = run;
    try {
      await run;
      flush();
    } catch (error) {
      if (preparation !== run) return;
      showError(errorMessage(error));
    }
  }

  function startOver() {
    controller?.abort();
    // An unfinished upload keeps its site locked, so it's released here
    const token = loadToken();
    const current = session();
    if (current && current.deployment.state !== "ready" && token) {
      cancelUpload(current.deployment.slug, token).catch(() => {});
    }
    forgetSite();
    clearFiles();
    setStage("idle");
  }

  function selectUpdate(slug: string, selected: SiteFile[]) {
    startOver();
    void selectFiles(selected);
    // Last, since selecting files resets a finished site's target
    setTarget(slug);
  }

  function chooseTarget(slug: string | null) {
    setStoredFiles(null);
    setDescription(null);
    setTarget(slug);
    setMessage("");
    setLockedUntil(null);
  }

  async function prepareUpdate(
    slug: string,
    manifest: ManifestFile[],
    signal: AbortSignal,
  ): Promise<DeploymentUploads> {
    const token = loadToken();
    if (!token) throw new Error("Import this site's token to update it.");
    try {
      const deployment = await updateDeployment(slug, manifest, token, signal);
      // The site stays ready on the server; here, the update is what's unfinished
      return { ...deployment, state: "uploading" };
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const current = await readDeployment(slug, token);
        if (Date.parse(current.locked_until) > Date.now()) {
          setLockedUntil(current.locked_until);
        }
      }
      throw error;
    }
  }

  // For uploads abandoned elsewhere, like in a closed tab
  async function takeOver() {
    const token = loadToken();
    const slug = target();
    if (!slug || !token) return;
    try {
      await cancelUpload(slug, token);
    } catch (error) {
      setMessage(errorMessage(error));
      return;
    }
    await publish();
  }

  function cancel() {
    controller?.abort();
  }

  async function publish() {
    const abort = new AbortController();
    controller = abort;
    setMessage("");
    setLockedUntil(null);
    setStage("hashing");

    try {
      const uploads = await preparation!;
      if (rejected(uploads)) {
        setStage("idle");
        return;
      }
      const manifest = fileManifest(uploads);
      abort.signal.throwIfAborted();

      let active = session();
      if (!active) {
        setStage("creating");
        let deployment: DeploymentUploads;
        const update = target();
        if (update) {
          deployment = await prepareUpdate(update, manifest, abort.signal);
        } else {
          const token = publishToken();
          try {
            deployment = await createDeployment(
              {
                files: manifest,
                slug: slug() ?? undefined,
                description: description() ?? undefined,
                version_description: note() || undefined,
                expires_at: expiresAt() ?? undefined,
              },
              token,
              abort.signal,
            );
          } catch (error) {
            // Offers lapse; dropping the choice has fresh ones fetched
            if (error instanceof ApiError && error.status === 409)
              setSlug(null);
            throw error;
          }
        }
        active = {
          deployment,
          manifest,
          originalSize: totalSize(),
          description: description() ?? undefined,
          note: note() || undefined,
        };
        saveSession(active);
        setSession(active);
      } else if (Date.now() >= Date.parse(active.deployment.locked_until)) {
        throw new Error("The upload window has closed. Start over.");
      } else if (!sameManifest(manifest, active.manifest)) {
        throw new Error("Select the same folder to resume, or start over.");
      }

      // Updates only sign new and changed files
      const signed = new Set(active.deployment.uploads.map(({ path }) => path));
      const pending = uploads.filter(({ path }) => signed.has(path));
      const progress = new Map<string, number>();
      let done = 0;
      const { schedule, flush } = batched(() => {
        setLoaded(
          [...progress.values()].reduce((sum, bytes) => sum + bytes, 0),
        );
        setUploaded(done);
      });
      const onProgress = (path: string, bytes: number, complete: boolean) => {
        progress.set(path, bytes);
        if (complete) done++;
        schedule();
      };
      setLoaded(0);
      setUploaded(0);
      setUploadCount(pending.length);
      setUploadSize(pending.reduce((sum, { file }) => sum + file.size, 0));
      setStage("uploading");
      try {
        // Only served once the upload completes, so any order works
        await uploadFiles(active.deployment, pending, abort.signal, onProgress);
      } finally {
        flush();
      }

      setStage("completing");
      const token = publishToken();
      const result = await completeDeployment(
        active.deployment.slug,
        active.manifest,
        active.description,
        active.note,
        token,
        abort.signal,
      );
      const finished = {
        ...active,
        deployment: { ...active.deployment, ...result },
      };
      saveSession(finished);
      setSession(finished);
      setStage("ready");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setMessage("Upload cancelled.");
      } else {
        setMessage(errorMessage(error));
      }
      setStage("error");
    } finally {
      controller = null;
    }
  }

  return {
    get files() {
      return files();
    },
    get compressed() {
      return compressed();
    },
    get limits() {
      return limits();
    },
    get session() {
      return session();
    },
    get stage() {
      return stage();
    },
    get message() {
      return message();
    },
    get target() {
      return target();
    },
    get lockedUntil() {
      return lockedUntil();
    },
    get description() {
      return description();
    },
    get diff() {
      return diff();
    },
    get unchanged() {
      return unchanged();
    },
    get checks() {
      return checks();
    },
    get uploaded() {
      return uploaded();
    },
    get uploadCount() {
      return uploadCount();
    },
    get busy() {
      return busy();
    },
    get live() {
      return live();
    },
    get compressedSize() {
      return compressedSize();
    },
    get percentage() {
      return percentage();
    },
    clearFiles,
    showError,
    selectFiles,
    startOver,
    selectUpdate,
    chooseTarget,
    get slug() {
      return slug();
    },
    setSlug: (slug: string | null) => setSlug(slug),
    get expiresAt() {
      return expiresAt();
    },
    setExpiresAt: (expiresAt: string | null) => setExpiresAt(expiresAt),
    setDescription: (description: string | null) => setDescription(description),
    get note() {
      return note();
    },
    setNote: (note: string) => setNote(note),
    cancel,
    publish,
    takeOver,
  };
}

// Shared by the drop page and the publish page, so files survive the route change
const Upload = createContext<ReturnType<typeof useUploadState>>();

export function UploadProvider(props: { children: JSX.Element }) {
  return <Upload value={useUploadState()}>{props.children}</Upload>;
}

export function useUpload() {
  return useContext(Upload);
}

// The whole page is the drop target, so a stray drop never opens the file
export function usePageDrop(
  accepts: Accessor<boolean>,
  onFiles?: (files: SiteFile[]) => void,
): Accessor<boolean> {
  const upload = useUpload();
  const [dragging, setDragging] = createSignal(false);

  async function receive(items: DataTransferItemList) {
    try {
      const selected = await droppedFiles(items, upload.limits);
      (onFiles ?? upload.selectFiles)(selected);
    } catch (error) {
      upload.showError(errorMessage(error));
    }
  }

  createEffect(accepts, (accepts) => {
    // Elements the drag is over; a count breaks when one is removed mid-drag
    const entered = new Set<Node>();
    const hasFiles = (event: DragEvent) =>
      event.dataTransfer?.types.includes("Files") ?? false;

    function enter(event: DragEvent) {
      if (!hasFiles(event)) return;
      entered.add(event.target as Node);
      setDragging(accepts);
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
    function drop(event: DragEvent) {
      if (!hasFiles(event)) return;
      event.preventDefault();
      entered.clear();
      setDragging(false);
      const items = event.dataTransfer?.items;
      if (accepts && items) receive(items);
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
  });

  return dragging;
}
