import { Navigate, createFileRoute } from "@tanstack/react-router";
import { cn } from "cn";
import { AddressPreview } from "@/components/address-preview";
import { CliCommand } from "@/components/cli-command";
import { FolderDrop } from "@/components/folder-drop";
import { SignInButton } from "@/components/sign-in-prompt";
import { inset } from "@/lib/layout";
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
  const signedOut = !token;
  const dragging = usePageDrop(!signedOut);

  // Listed files are reviewed and published on their own page
  if (files.length > 0) return <Navigate to="/publish" />;

  return (
    <div className="flex flex-1 flex-col">
      {session && stage !== "ready" && (
        <p className={cn(inset, "border-b bg-muted/60 py-3 text-sm")}>
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
        <p className={cn(inset, "border-b bg-muted/60 py-3 text-sm")}>
          Select the new version of <span className="font-mono">{target}</span>{" "}
          to update it, or{" "}
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
      <FolderDrop
        // The space between the rules is the drop zone, filling what the footer leaves
        className="flex-1 rounded-none bg-transparent shadow-none"
        heading
        prompt={
          <>
            Drop a folder.
            <br />
            <span className="text-muted-foreground">Get an address.</span>
          </>
        }
        hint="Publish a built site, a zip, or a single HTML file. No build step, no config, and it stays online until you delete it."
        actions={signedOut ? <SignInButton /> : undefined}
        footer={<AddressPreview className="mt-10 w-full max-w-lg" />}
        dragging={dragging}
        limits={limits}
        error={message}
        checks={checks}
        onFiles={selectFiles}
        onError={showError}
        onDismiss={clearFiles}
      />
      <div className={cn(inset, "flex justify-center border-t py-4")}>
        <CliCommand variant="plain" />
      </div>
    </div>
  );
}
