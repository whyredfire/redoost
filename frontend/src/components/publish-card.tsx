import { CircleCheck, ExternalLink, FolderOpen } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { CopyButton } from "@/components/copy-button";
import { FolderDrop } from "@/components/folder-drop";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  completeDeployment,
  createDeployment,
  uploadFiles,
  type ManifestFile,
  type UploadSession,
} from "@/lib/deploy";
import { formatBytes, siteUrl } from "@/lib/format";
import {
  clearSession,
  loadSession,
  loadToken,
  saveSession,
  saveToken,
} from "@/lib/session";
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

export function PublishCard({ onPublished }: { onPublished: () => void }) {
  const [files, setFiles] = useState<SiteFile[]>([]);
  const [session, setSession] = useState<UploadSession | null>(loadSession);
  const [stage, setStage] = useState<Stage>(
    session?.deployment.state === "ready" ? "ready" : "idle",
  );
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [uploaded, setUploaded] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const controller = useRef<AbortController | null>(null);

  const busy = ["hashing", "creating", "uploading", "completing"].includes(
    stage,
  );
  const totalSize = files.reduce((sum, { file }) => sum + file.size, 0);
  const loaded = Object.values(progress).reduce((sum, bytes) => sum + bytes, 0);
  const percentage = totalSize ? Math.round((loaded / totalSize) * 100) : 0;

  function selectFiles(selected: SiteFile[]) {
    if (!selected.length) {
      setMessage("This folder has no files.");
      return;
    }
    setFiles(selected);
    setShowAll(false);
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

      let active = session;
      if (!active) {
        setStage("creating");
        const deployment = await createDeployment(
          manifest,
          loadToken(),
          abort.signal,
        );
        active = { deployment, manifest };
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
      onPublished();
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

  if (stage === "ready" && session) {
    const url = siteUrl(session.deployment.slug);
    return (
      <Card>
        <CardContent className="space-y-5">
          <div className="flex items-center gap-3">
            <CircleCheck className="size-6 text-emerald-600 dark:text-emerald-500" />
            <div>
              <p className="font-medium">Your site is live</p>
              <p className="text-sm text-muted-foreground">
                Share this address with anyone.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-xl border bg-muted/40 py-1 pr-1 pl-3">
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
          </div>
        </CardContent>
        <CardFooter className="border-t">
          <Button type="button" variant="outline" onClick={startOver}>
            Publish another site
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-5">
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
            disabled={busy}
            onFiles={selectFiles}
            onError={setMessage}
          />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <FolderOpen className="size-5 text-muted-foreground" />
              <p className="font-medium">
                {files.length} {files.length === 1 ? "file" : "files"} ·{" "}
                {formatBytes(totalSize)}
              </p>
            </div>
            <ul
              className={`space-y-1.5 font-mono text-xs text-muted-foreground ${showAll ? "max-h-64 overflow-y-auto pr-2" : ""}`}
            >
              {(showAll ? files : files.slice(0, 5)).map(({ path, file }) => (
                <li className="flex justify-between gap-4" key={path}>
                  <span className="truncate" title={path}>
                    {path}
                  </span>
                  <span className="shrink-0">{formatBytes(file.size)}</span>
                </li>
              ))}
            </ul>
            {files.length > 5 && (
              <button
                type="button"
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? "Show less" : `and ${files.length - 5} more`}
              </button>
            )}
          </div>
        )}

        {stage === "uploading" && (
          <div className="space-y-2 text-sm" aria-live="polite">
            <div className="flex justify-between">
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
      </CardContent>

      {files.length > 0 && (
        <CardFooter className="justify-end gap-3 border-t">
          {busy ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => controller.current?.abort()}
            >
              Cancel
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={() => setFiles([])}>
              Clear
            </Button>
          )}
          <Button type="button" disabled={busy} onClick={publish}>
            {busy
              ? "Publishing…"
              : !session
                ? "Publish site"
                : stage === "error"
                  ? "Retry upload"
                  : "Resume upload"}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
