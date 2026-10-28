import {
  createContext,
  use,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ApiError,
  cancelUpload,
  completeDeployment,
  createDeployment,
  readDeployment,
  readFiles,
  readLimits,
  updateDeployment,
  uploadFiles,
  type DeploymentUploads,
  type Limits,
  type ManifestFile,
  type StoredFile,
  type UploadSession,
} from "./deploy";
import { publishToken } from "./auth";
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

function useUploadState() {
  const [files, setFiles] = useState<SiteFile[]>([]);
  const [compressed, setCompressed] = useState<Record<string, UploadFile>>({});
  const [session, setSession] = useState<UploadSession | null>(loadSession);
  const [stage, setStage] = useState<Stage>(
    session?.deployment.state === "ready" ? "ready" : "idle",
  );
  const [message, setMessage] = useState("");
  // The site whose files the next publish replaces
  const [target, setTarget] = useState<string | null>(null);
  // When another tab's or device's upload to the target frees it
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  // The target's files, to show what the update changes
  const [storedFiles, setStoredFiles] = useState<StoredFile[] | null>(null);
  // Null leaves an updated site's description as it is, as when it couldn't be read
  const [description, setDescription] = useState<string | null>(null);
  const [checks, setChecks] = useState<SiteCheck[]>([]);
  const [loaded, setLoaded] = useState(0);
  const [uploaded, setUploaded] = useState(0);
  const [uploadCount, setUploadCount] = useState(0);
  const [uploadSize, setUploadSize] = useState(0);
  const [limits, setLimits] = useState<Limits | null>(null);
  const controller = useRef<AbortController | null>(null);
  // Files are compressed and hashed as soon as they're selected, and Publish reuses them
  const preparation = useRef<Promise<UploadFile[]> | null>(null);

  const busy = ["hashing", "creating", "uploading", "completing"].includes(
    stage,
  );
  const live = stage === "ready" && session !== null;
  const totalSize = files.reduce((sum, { file }) => sum + file.size, 0);
  const compressedFiles = Object.values(compressed);
  const compressedSize =
    compressedFiles.length === files.length
      ? compressedFiles.reduce((sum, { file }) => sum + file.size, 0)
      : null;
  const diff = storedFiles && siteChanges(files, compressedFiles, storedFiles);
  // Known once every file is hashed
  const unchanged =
    diff !== null &&
    compressedSize !== null &&
    diff.changes.size === 0 &&
    diff.removed.length === 0;
  const percentage = uploadSize ? Math.round((loaded / uploadSize) * 100) : 0;

  useEffect(() => {
    const token = loadToken();
    if (!target || !token) return;
    let current = true;
    readFiles(target, token)
      .then((files) => {
        if (current) setStoredFiles(files);
      })
      // Without them, the files are listed without changes
      .catch(() => {});
    // Filled in, so the update can change it
    readDeployment(target, token)
      .then((site) => {
        if (current) setDescription(site.description);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [target]);

  useEffect(() => {
    // Without limits, the API still rejects oversized sites when publishing
    readLimits()
      .then(setLimits)
      .catch(() => {});
  }, []);

  function clearFiles() {
    preparation.current = null;
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
    // A published site is done with; new files start a new one
    if (live) {
      clearSession();
      setSession(null);
      setTarget(null);
      setStoredFiles(null);
      setDescription(null);
    }
    clearFiles();
    setStage("idle");
    // Before any file is read, so an oversized one can't fill the tab's memory
    if (rejected(selected)) return;
    // Without index.html the files are only checked, never listed
    if (selected.some(({ path }) => path === "index.html")) {
      setFiles(selected);
    }

    let batch: Record<string, UploadFile> = {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    function flush() {
      clearTimeout(timer);
      timer = undefined;
      const prepared = batch;
      batch = {};
      if (preparation.current === run) {
        setCompressed((current) => ({ ...current, ...prepared }));
      }
    }

    // Batched, since each update re-renders every listed file
    const run = prepareFiles(selected, (file) => {
      batch[file.path] = file;
      timer ??= setTimeout(flush, 100);
    });
    preparation.current = run;
    try {
      await run;
      flush();
    } catch (error) {
      if (preparation.current !== run) return;
      showError(error instanceof Error ? error.message : String(error));
    }
  }

  function startOver() {
    controller.current?.abort();
    // An unfinished upload keeps its site locked, so it's released here
    const token = loadToken();
    if (session && session.deployment.state !== "ready" && token) {
      cancelUpload(session.deployment.slug, token).catch(() => {});
    }
    clearSession();
    setSession(null);
    setTarget(null);
    setStoredFiles(null);
    setDescription(null);
    clearFiles();
    setStage("idle");
  }

  function selectUpdate(slug: string, selected: SiteFile[]) {
    startOver();
    void selectFiles(selected);
    // Last, since selecting files resets a finished site's target
    setTarget(slug);
  }

  // Keeps the files already picked
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
        if (Date.parse(current.expires_at) > Date.now()) {
          setLockedUntil(current.expires_at);
        }
      }
      throw error;
    }
  }

  // For uploads abandoned elsewhere, like in a closed tab
  async function takeOver() {
    const token = loadToken();
    if (!target || !token) return;
    try {
      await cancelUpload(target, token);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      return;
    }
    await publish();
  }

  function cancel() {
    controller.current?.abort();
  }

  async function publish() {
    const abort = new AbortController();
    controller.current = abort;
    setMessage("");
    setLockedUntil(null);
    setStage("hashing");

    try {
      const uploads = await preparation.current!;
      if (rejected(uploads)) {
        setStage("idle");
        return;
      }
      const manifest = fileManifest(uploads);
      abort.signal.throwIfAborted();

      let active = session;
      if (!active) {
        setStage("creating");
        let deployment: DeploymentUploads;
        if (target) {
          deployment = await prepareUpdate(target, manifest, abort.signal);
        } else {
          const token = publishToken();
          deployment = await createDeployment(
            manifest,
            description ?? undefined,
            token,
            abort.signal,
          );
        }
        active = {
          deployment,
          manifest,
          originalSize: totalSize,
          description: description ?? undefined,
        };
        saveSession(active);
        setSession(active);
      } else if (Date.now() >= Date.parse(active.deployment.expires_at)) {
        throw new Error("The upload window has closed. Start over.");
      } else if (!sameManifest(manifest, active.manifest)) {
        throw new Error("Select the same folder to resume, or start over.");
      }

      // Updates only sign new and changed files
      const signed = new Set(active.deployment.uploads.map(({ path }) => path));
      const pending = uploads.filter(({ path }) => signed.has(path));
      // Pages go last, so a live site never links to assets still uploading
      const pages = pending.filter(({ path }) => /\.html?$/i.test(path));
      const assets = pending.filter((file) => !pages.includes(file));
      // Batched, since each update re-renders every listed file
      const progress = new Map<string, number>();
      let done = 0;
      let timer: ReturnType<typeof setTimeout> | undefined;
      function flush() {
        clearTimeout(timer);
        timer = undefined;
        setLoaded(
          [...progress.values()].reduce((sum, bytes) => sum + bytes, 0),
        );
        setUploaded(done);
      }
      const onProgress = (path: string, bytes: number, complete: boolean) => {
        progress.set(path, bytes);
        if (complete) done++;
        timer ??= setTimeout(flush, 100);
      };
      setLoaded(0);
      setUploaded(0);
      setUploadCount(pending.length);
      setUploadSize(pending.reduce((sum, { file }) => sum + file.size, 0));
      setStage("uploading");
      try {
        await uploadFiles(active.deployment, assets, abort.signal, onProgress);
        await uploadFiles(active.deployment, pages, abort.signal, onProgress);
      } finally {
        flush();
      }

      setStage("completing");
      const token = publishToken();
      const result = await completeDeployment(
        active.deployment.slug,
        active.manifest,
        active.description,
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
        setMessage(error instanceof Error ? error.message : String(error));
      }
      setStage("error");
    } finally {
      controller.current = null;
    }
  }

  return {
    files,
    compressed,
    limits,
    session,
    stage,
    message,
    target,
    lockedUntil,
    description,
    diff,
    unchanged,
    checks,
    uploaded,
    uploadCount,
    busy,
    live,
    totalSize,
    compressedSize,
    percentage,
    clearFiles,
    showError,
    selectFiles,
    startOver,
    selectUpdate,
    chooseTarget,
    setDescription,
    cancel,
    publish,
    takeOver,
  };
}

// Shared by the drop page and the publish page, so files survive the route change
const Upload = createContext<ReturnType<typeof useUploadState> | null>(null);

export function UploadProvider({ children }: { children: ReactNode }) {
  return <Upload value={useUploadState()}>{children}</Upload>;
}

export function useUpload() {
  return use(Upload)!;
}

// The whole page is the drop target, so a stray drop never opens the file
export function usePageDrop(
  accepts: boolean,
  onFiles?: (files: SiteFile[]) => void,
) {
  const { selectFiles, showError, limits } = useUpload();
  const [dragging, setDragging] = useState(false);

  const receive = useEffectEvent(async (items: DataTransferItemList) => {
    try {
      const selected = await droppedFiles(items, limits);
      (onFiles ?? selectFiles)(selected);
    } catch (error) {
      showError(error instanceof Error ? error.message : String(error));
    }
  });

  useEffect(() => {
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
  }, [accepts]);

  return dragging;
}
