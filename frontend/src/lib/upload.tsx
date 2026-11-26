import {
  ApiError,
  errorMessage,
  fileManifest,
  prepareFiles,
  siteChanges,
  siteChecks,
  uploadFiles,
} from "@redoost/shared";
import type {
  DeploymentUploads,
  Limits,
  ManifestFile,
  SiteCheck,
  SiteFile,
  StoredFile,
  UploadFile,
} from "@redoost/shared";
import type { JSX } from "@solidjs/web";
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onSettled,
  useContext,
} from "solid-js";
import type { Accessor } from "solid-js";

import { api } from "./api";
import { publishToken } from "./auth";
import { clearSession, loadSession, loadToken, saveSession } from "./session";
import type { UploadSession } from "./session";
import { droppedFiles } from "./site-files";
import { postWithProgress } from "./upload-files";

export type Stage =
  | "idle"
  | "hashing"
  | "creating"
  | "uploading"
  | "completing"
  | "ready"
  | "error";

const sameManifest = (a: ManifestFile[], b: ManifestFile[]) =>
  a.length === b.length &&
  a.every(
    (file, i) =>
      file.path === b[i]?.path &&
      file.size === b[i]?.size &&
      file.sha256 === b[i]?.sha256
  );

const hasFiles = (event: DragEvent) =>
  event.dataTransfer?.types.includes("Files") ?? false;

const over = (event: DragEvent) => {
  if (hasFiles(event)) {
    event.preventDefault();
  }
};

const batched = (update: () => void) => {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    update();
  };

  const schedule = () => {
    timer ??= setTimeout(flush, 100);
  };

  return { schedule, flush };
};

const useUploadState = () => {
  const [files, setFiles] = createSignal<SiteFile[]>([]);

  const [compressed, setCompressed] = createSignal<Record<string, UploadFile>>(
    {}
  );

  const initialSession = loadSession();

  const [session, setSession] = createSignal<UploadSession | null>(
    initialSession
  );

  const [stage, setStage] = createSignal<Stage>(
    initialSession?.deployment.state === "ready" ? "ready" : "idle"
  );

  const [message, setMessage] = createSignal("");
  const [target, setTarget] = createSignal<string | null>(null);
  const [slug, setSlug] = createSignal<string | null>(null);
  const [expiresAt, setExpiresAt] = createSignal<string | null>(null);
  const [lockedUntil, setLockedUntil] = createSignal<string | null>(null);
  const [storedFiles, setStoredFiles] = createSignal<StoredFile[] | null>(null);
  const [description, setDescription] = createSignal<string | null>(null);
  const [note, setNote] = createSignal("");
  const [checks, setChecks] = createSignal<SiteCheck[]>([]);
  const [loaded, setLoaded] = createSignal(0);
  const [uploaded, setUploaded] = createSignal(0);
  const [uploadCount, setUploadCount] = createSignal(0);
  const [uploadSize, setUploadSize] = createSignal(0);
  const [limits, setLimits] = createSignal<Limits | null>(null);
  let controller: AbortController | null = null;
  let preparation: Promise<UploadFile[]> | null = null;

  const busy = createMemo(() =>
    ["hashing", "creating", "uploading", "completing"].includes(stage())
  );

  const live = createMemo(() => stage() === "ready" && session() !== null);
  const totalSize = () => files().reduce((sum, { file }) => sum + file.size, 0);
  const compressedFiles = createMemo(() => Object.values(compressed()));

  const compressedSize = createMemo(() =>
    compressedFiles().length === files().length
      ? compressedFiles().reduce((sum, { file }) => sum + file.size, 0)
      : null
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
    uploadSize() ? Math.round((loaded() / uploadSize()) * 100) : 0
  );

  createEffect(target, (site) => {
    const token = loadToken();

    if (!site || !token) {
      return;
    }

    let current = true;
    api(token)
      .readFiles(site)
      .then((stored) => current && setStoredFiles(stored))
      .catch(() => null);
    api(token)
      .readDeployment(site)
      .then((read) => current && setDescription(read.description))
      .catch(() => null);

    return () => {
      current = false;
    };
  });

  onSettled(() => {
    api()
      .readLimits()
      .then((read) => setLimits(read))
      .catch(() => null);
  });

  const forgetSite = () => {
    clearSession();
    setSession(null);
    setTarget(null);
    setSlug(null);
    setExpiresAt(null);
    setStoredFiles(null);
    setDescription(null);
    setNote("");
  };

  const clearFiles = () => {
    preparation = null;
    setFiles([]);
    setCompressed({});
    setMessage("");
    setLockedUntil(null);
    setChecks([]);
  };

  const showError = (text: string) => {
    clearFiles();
    setMessage(text);
  };

  const rejected = (uploads: SiteFile[]) => {
    const results = siteChecks(uploads, limits());

    if (results.every(({ passed }) => passed)) {
      return false;
    }

    clearFiles();
    setChecks(results);

    return true;
  };

  const selectFiles = async (selected: SiteFile[]) => {
    if (!selected.length) {
      showError("This folder has no files.");

      return;
    }

    if (live()) {
      forgetSite();
    }

    clearFiles();
    setStage("idle");

    // WARNING: check limits before any file is read, so an oversized one can't fill the tab's memory
    if (rejected(selected)) {
      return;
    }

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
      if (preparation !== run) {
        return;
      }

      showError(errorMessage(error));
    }
  };

  const startOver = () => {
    controller?.abort();
    const token = loadToken();
    const current = session();

    if (current && current.deployment.state !== "ready" && token) {
      api(token)
        .cancelUpload(current.deployment.slug)
        .catch(() => null);
    }

    forgetSite();
    clearFiles();
    setStage("idle");
  };

  const selectUpdate = (site: string, selected: SiteFile[]) => {
    startOver();
    void selectFiles(selected);
    // WARNING: keep this last, since selecting files resets a finished site's target
    setTarget(site);
  };

  const chooseTarget = (site: string | null) => {
    setStoredFiles(null);
    setDescription(null);
    setTarget(site);
    setMessage("");
    setLockedUntil(null);
  };

  const prepareUpdate = async (
    site: string,
    manifest: ManifestFile[],
    signal: AbortSignal
  ) => {
    const token = loadToken();

    if (!token) {
      throw new Error("Import this site's token to update it.");
    }

    try {
      const deployment = await api(token).updateDeployment(
        site,
        { files: manifest },
        signal
      );

      return { ...deployment, state: "uploading" } satisfies DeploymentUploads;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const current = await api(token).readDeployment(site);

        if (Date.parse(current.locked_until) > Date.now()) {
          setLockedUntil(current.locked_until);
        }
      }

      throw error;
    }
  };

  const takeOver = async () => {
    const token = loadToken();
    const site = target();

    if (!site || !token) {
      return;
    }

    try {
      await api(token).cancelUpload(site);
    } catch (error) {
      setMessage(errorMessage(error));

      return;
    }

    await publish();
  };

  const cancel = () => {
    controller?.abort();
  };

  const publish = async () => {
    const abort = new AbortController();
    controller = abort;
    setMessage("");
    setLockedUntil(null);
    setStage("hashing");

    try {
      if (!preparation) {
        throw new Error("Select files to publish.");
      }

      const uploads = await preparation;

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
            deployment = await api(token).createDeployment(
              {
                files: manifest,
                slug: slug() ?? undefined,
                description: description() ?? undefined,
                version_description: note() || undefined,
                expires_at: expiresAt() ?? undefined,
              },
              abort.signal
            );
          } catch (error) {
            if (error instanceof ApiError && error.status === 409) {
              setSlug(null);
            }

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

      const signed = new Set(active.deployment.uploads.map(({ path }) => path));
      const pending = uploads.filter(({ path }) => signed.has(path));
      const progress = new Map<string, number>();
      let done = 0;

      const { schedule, flush } = batched(() => {
        setLoaded(
          [...progress.values()].reduce((sum, bytes) => sum + bytes, 0)
        );
        setUploaded(done);
      });

      const onProgress = (path: string, bytes: number, complete: boolean) => {
        progress.set(path, bytes);

        if (complete) {
          done += 1;
        }

        schedule();
      };

      setLoaded(0);
      setUploaded(0);
      setUploadCount(pending.length);
      setUploadSize(pending.reduce((sum, { file }) => sum + file.size, 0));
      setStage("uploading");

      try {
        await uploadFiles(active.deployment, pending, {
          concurrency: 32,
          signal: abort.signal,
          onProgress,
          post: postWithProgress,
        });
      } finally {
        flush();
      }

      setStage("completing");
      const token = publishToken();

      const result = await api(token).completeDeployment(
        active.deployment.slug,
        {
          files: active.manifest,
          description: active.description,
          version_description: active.note,
        },
        abort.signal
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
  };

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
    setSlug: (value: string | null) => setSlug(value),
    get expiresAt() {
      return expiresAt();
    },
    setExpiresAt: (value: string | null) => setExpiresAt(value),
    setDescription: (value: string | null) => setDescription(value),
    get note() {
      return note();
    },
    setNote: (value: string) => setNote(value),
    cancel,
    publish,
    takeOver,
  };
};

const Upload = createContext<ReturnType<typeof useUploadState>>();

export const UploadProvider = (props: { children: JSX.Element }) => (
  <Upload value={useUploadState()}>{props.children}</Upload>
);

export const useUpload = () => useContext(Upload);

export const usePageDrop = (
  accepts: Accessor<boolean>,
  onFiles?: (files: SiteFile[]) => void
) => {
  const upload = useUpload();
  const [dragging, setDragging] = createSignal(false);

  const receive = async (items: DataTransferItemList) => {
    try {
      const selected = await droppedFiles(items, upload.limits);
      (onFiles ?? upload.selectFiles)(selected);
    } catch (error) {
      upload.showError(errorMessage(error));
    }
  };

  createEffect(accepts, (accepting) => {
    // WARNING: track elements, not a count; a count breaks when an element is removed mid-drag
    const entered = new Set<Node>();

    const enter = (event: DragEvent) => {
      if (!hasFiles(event)) {
        return;
      }

      if (event.target instanceof Node) {
        entered.add(event.target);
      }

      setDragging(accepting);
    };

    const leave = (event: DragEvent) => {
      if (!hasFiles(event)) {
        return;
      }

      if (event.target instanceof Node) {
        entered.delete(event.target);
      }

      for (const node of entered) {
        if (!node.isConnected) {
          entered.delete(node);
        }
      }

      if (entered.size === 0) {
        setDragging(false);
      }
    };

    const drop = (event: DragEvent) => {
      if (!hasFiles(event)) {
        return;
      }

      event.preventDefault();
      entered.clear();
      setDragging(false);
      const items = event.dataTransfer?.items;

      if (accepting && items) {
        receive(items);
      }
    };

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
};
