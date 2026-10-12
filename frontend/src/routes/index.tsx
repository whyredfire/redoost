import { Navigate, createFileRoute } from "@tanstack/react-router";
import { AddressPreview } from "@/components/address-preview";
import { CliCommand } from "@/components/cli-command";
import { FolderDrop } from "@/components/folder-drop";
import { SignInPrompt } from "@/components/sign-in-prompt";
import { formatBytes } from "@/lib/format";
import { useToken } from "@/lib/session";
import { usePageDrop, useUpload } from "@/lib/upload";

export const Route = createFileRoute("/")({
  component: LandingPage,
});

function LandingPage() {
  const {
    files,
    session,
    stage,
    message,
    target,
    checks,
    limits,
    selectFiles,
    showError,
    clearFiles,
    startOver,
  } = useUpload();
  const token = useToken();
  // Accounts can't publish until they sign in
  const signedOut = !token;
  const dragging = usePageDrop(!signedOut);

  // Listed files are reviewed and published on their own page
  if (files.length > 0) return <Navigate to="/publish" />;

  return (
    <>
      <h1 className="text-4xl font-semibold tracking-tighter text-balance sm:text-6xl">
        Drop a folder.
        <br />
        <span className="text-muted-foreground">Get an address.</span>
      </h1>
      <p className="mt-4 max-w-xl text-muted-foreground sm:text-lg">
        Publish a built site, a zip, or a single HTML file. No build step, no
        config, and it stays online until you delete it.
      </p>
      <AddressPreview className="mt-10" />
      <div className="mt-4 flex flex-col gap-4">
        {session && stage !== "ready" && (
          <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm">
            Select the same files to resume{" "}
            <span className="font-mono">{session.deployment.slug}</span>, or{" "}
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={startOver}
            >
              start over
            </button>
            .
          </p>
        )}
        {target && !session && (
          <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm">
            Select the new version of{" "}
            <span className="font-mono">{target}</span> to update it, or{" "}
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={startOver}
            >
              publish a new site
            </button>{" "}
            instead.
          </p>
        )}
        {signedOut ? (
          <SignInPrompt
            title="Sign in to publish"
            description="Your sites stay online for as long as you keep them."
          />
        ) : (
          <FolderDrop
            dragging={dragging}
            error={message}
            checks={checks}
            onFiles={selectFiles}
            onError={showError}
            onDismiss={clearFiles}
          />
        )}
        <CliCommand />
        {limits && (
          <p className="font-mono text-xs text-muted-foreground">
            Up to {formatBytes(limits.max_file_size)} per file ·{" "}
            {formatBytes(limits.max_deployment_size)} and{" "}
            {limits.max_deployment_files} files per site
          </p>
        )}
      </div>
    </>
  );
}
