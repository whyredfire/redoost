import { Navigate, createFileRoute } from "@tanstack/solid-router";
import { Show } from "solid-js";
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
  const upload = useUpload();
  const token = useToken();
  const signedOut = () => !token();
  const dragging = usePageDrop(() => !signedOut());

  // Listed files are reviewed and published on their own page
  return (
    <Show
      when={upload.files.length === 0}
      fallback={<Navigate to="/publish" />}
    >
      <div class="flex flex-1 flex-col">
        <Show when={upload.session && upload.stage !== "ready"}>
          <p class={cn(inset, "border-b bg-muted/60 py-3 text-sm")}>
            Select the same files to resume{" "}
            <span class="font-mono">{upload.session?.deployment.slug}</span>, or{" "}
            <button
              type="button"
              class="underline underline-offset-4"
              onClick={() => upload.startOver()}
            >
              start over
            </button>
            .
          </p>
        </Show>
        <Show when={upload.target && !upload.session}>
          <p class={cn(inset, "border-b bg-muted/60 py-3 text-sm")}>
            Select the new version of{" "}
            <span class="font-mono">{upload.target}</span> to update it, or{" "}
            <button
              type="button"
              class="underline underline-offset-4"
              onClick={() => upload.startOver()}
            >
              publish a new site
            </button>{" "}
            instead.
          </p>
        </Show>
        <FolderDrop
          // The space between the rules is the drop zone, filling what the footer leaves
          class="flex-1 rounded-none bg-transparent shadow-none"
          heading
          prompt={
            <>
              Drop a folder.
              <br />
              <span class="text-muted-foreground">Get an address.</span>
            </>
          }
          hint="Publish a built site, a zip, or a single HTML file. No build step, no config, and it stays online until you delete it."
          actions={signedOut() ? <SignInButton /> : undefined}
          footer={<AddressPreview class="mt-10 w-full max-w-lg" />}
          dragging={dragging()}
          limits={upload.limits}
          error={upload.message}
          checks={upload.checks}
          onFiles={upload.selectFiles}
          onError={upload.showError}
          onDismiss={upload.clearFiles}
        />
        <div class={cn(inset, "flex justify-center border-t py-4")}>
          <CliCommand variant="plain" />
        </div>
      </div>
    </Show>
  );
}
