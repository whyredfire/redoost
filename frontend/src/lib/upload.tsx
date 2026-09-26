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
  completeDeployment,
  createDeployment,
  readLimits,
  uploadFiles,
  type Limits,
  type ManifestFile,
  type UploadSession,
} from "./deploy";
import {
  clearSession,
  loadSession,
  loadToken,
  saveSession,
  saveToken,
} from "./session";
import {
  compressFiles,
  droppedFiles,
  fileManifest,
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
  const [checks, setChecks] = useState<SiteCheck[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [uploaded, setUploaded] = useState(0);
  const [uploadSize, setUploadSize] = useState(0);
  const [limits, setLimits] = useState<Limits | null>(null);
  const controller = useRef<AbortController | null>(null);
  // Files are compressed as soon as they're selected, and Publish reuses it
  const compression = useRef<Promise<UploadFile[]> | null>(null);

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
    // A published site is done with; new files start a new one
    if (live) {
      clearSession();
      setSession(null);
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

  function cancel() {
    controller.current?.abort();
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

  return {
    files,
    compressed,
    session,
    stage,
    message,
    checks,
    uploaded,
    busy,
    live,
    totalSize,
    compressedSize,
    percentage,
    clearFiles,
    showError,
    selectFiles,
    startOver,
    cancel,
    publish,
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
export function usePageDrop(accepts: boolean) {
  const { selectFiles, showError } = useUpload();
  const [dragging, setDragging] = useState(false);

  const receive = useEffectEvent(async (items: DataTransferItemList) => {
    try {
      const selected = await droppedFiles(items);
      selectFiles(selected);
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
