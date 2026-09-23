import { useRef, useState } from "react";
import { FolderDrop } from "@/components/folder-drop";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  completeDeployment,
  createDeployment,
  uploadFiles,
  type ManifestFile,
  type UploadSession,
} from "@/lib/deploy";
import { clearSession, loadSession, saveSession } from "@/lib/session";
import { fileManifest, type SiteFile } from "@/lib/site-files";

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

function siteUrl(slug: string) {
  const origin = process.env.BUN_PUBLIC_SITES_ORIGIN;
  if (!origin) return null;
  const url = new URL(origin);
  url.hostname = `${slug}.${url.hostname}`;
  return url.origin;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

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

export function App() {
  const [files, setFiles] = useState<SiteFile[]>([]);
  const [session, setSession] = useState<UploadSession | null>(loadSession);
  const [stage, setStage] = useState<Stage>(
    session?.deployment.state === "ready" ? "ready" : "idle",
  );
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [uploaded, setUploaded] = useState(0);
  const controller = useRef<AbortController | null>(null);

  const busy = ["hashing", "creating", "uploading", "completing"].includes(
    stage,
  );
  const totalSize = files.reduce((sum, { file }) => sum + file.size, 0);
  const loaded = Object.values(progress).reduce((sum, bytes) => sum + bytes, 0);
  const percentage = totalSize ? Math.round((loaded / totalSize) * 100) : 0;
  const publishedUrl = session ? siteUrl(session.deployment.slug) : null;

  function selectFiles(selected: SiteFile[]) {
    if (!selected.length) {
      setMessage("This folder has no files.");
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
      if (!manifest.some(({ path }) => path === "index.html")) {
        throw new Error("Choose a folder with index.html at its root.");
      }

      let active = session;
      if (!active) {
        setStage("creating");
        active = {
          deployment: await createDeployment(manifest, abort.signal),
          manifest,
        };
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

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-5 py-12 sm:py-20">
      <header className="flex items-center gap-3 text-sm font-semibold tracking-tight">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          r.
        </span>
        redoost
      </header>

      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          A home for your static site.
        </h1>
        <p className="max-w-xl text-muted-foreground">
          Drop a built site folder and get a shareable address. No account or
          build step required.
        </p>
      </div>

      {stage === "ready" && session ? (
        <Card>
          <CardHeader>
            <CardTitle>Site published</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {publishedUrl ? (
              <a
                className="block break-all font-medium text-primary underline underline-offset-4"
                href={publishedUrl}
                target="_blank"
                rel="noreferrer"
              >
                {publishedUrl}
              </a>
            ) : (
              <p className="font-medium">{session.deployment.slug}</p>
            )}
            <Button type="button" variant="outline" onClick={startOver}>
              Publish another site
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {session && (
            <p className="rounded-lg border bg-muted/40 p-4 text-sm">
              Resume{" "}
              <span className="font-medium">{session.deployment.slug}</span> by
              selecting the same folder.
              <Button
                type="button"
                variant="link"
                className="ml-1 h-auto p-0"
                onClick={startOver}
                disabled={busy}
              >
                Start over
              </Button>
            </p>
          )}

          <FolderDrop
            disabled={busy}
            onFiles={selectFiles}
            onError={setMessage}
          />

          {files.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {files.length} files · {formatBytes(totalSize)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  {files.slice(0, 6).map(({ path, file }) => (
                    <li className="flex justify-between gap-4" key={path}>
                      <span className="truncate" title={path}>
                        {path}
                      </span>
                      <span className="shrink-0">{formatBytes(file.size)}</span>
                    </li>
                  ))}
                </ul>
                {files.length > 6 && (
                  <p className="mt-3 text-sm text-muted-foreground">
                    + {files.length - 6} more files
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {stage === "uploading" && (
            <div className="space-y-2 text-sm" aria-live="polite">
              <div className="flex justify-between">
                <span>
                  Uploading {uploaded} of {files.length} files
                </span>
                <span>{percentage}%</span>
              </div>
              <Progress value={percentage} aria-label="Upload progress" />
            </div>
          )}

          {statusText[stage] && (
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {statusText[stage]}
            </p>
          )}

          {message && (
            <p role="alert" className="text-sm text-destructive">
              {message}
            </p>
          )}

          <div className="flex gap-3">
            <Button
              type="button"
              disabled={!files.length || busy}
              onClick={publish}
            >
              {!session
                ? "Publish site"
                : stage === "error"
                  ? "Retry upload"
                  : "Resume upload"}
            </Button>
            {busy && (
              <Button
                type="button"
                variant="outline"
                onClick={() => controller.current?.abort()}
              >
                Cancel
              </Button>
            )}
          </div>
        </>
      )}
    </main>
  );
}
